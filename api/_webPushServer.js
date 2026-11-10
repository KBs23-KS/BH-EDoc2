/**
 * Web Push infrastructure for BHS E-Document.
 *
 * Reuses the existing 7-day school username/password session cookie.
 * Does NOT change Firebase Auth, login, passwords, school documents or Rules.
 *
 * Subscriptions live OUTSIDE artifacts/.../public and are AES-256-GCM encrypted
 * even at rest. The Firebase Rules cutover must explicitly deny browser
 * read/write access to bhs_private_webpush before this feature is enabled.
 */
import {createHash,createCipheriv,createDecipheriv,randomBytes}
  from "node:crypto";
import {getApps,initializeApp,cert} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import webpush from "web-push";
import {incomingUnreadCount,recentIncomingAcknowledgement} from "../shared/incomingBadge.js";
import {readAppSession,userRef,appSessionReady,appSessionFingerprint}
  from "./_signatureServer.js";

const PROJECT="bhs-edoc-2";
const COLLECTION="bhs_private_webpush";
const DOCS_COLLECTION="artifacts/bhs-edoc-app/public/data/bhs_documents";
const DISPATCHES="bhs_private_webpush_dispatches";
const MAX_DEVICES=8;
const ALLOWED_PUSH_HOSTS=new Set([
  "fcm.googleapis.com","android.googleapis.com",
  "updates.push.services.mozilla.com"
]);
const issue=(status,code)=>Object.assign(new Error(code),{status,code});
const isPushEndpoint=raw=>{
  try{
    const url=new URL(raw);
    return url.protocol==="https:"&&!url.username&&!url.password&&!url.port&&
      (ALLOWED_PUSH_HOSTS.has(url.hostname)||
       url.hostname==="push.apple.com"||
       url.hostname.endsWith(".push.apple.com"));
  }catch{return false;}
};
const sha=value=>createHash("sha256").update(value,"utf8").digest("hex");
function encryptionKey(){
  const value=process.env.BHS_WEB_PUSH_STORE_KEY||"";
  const key=Buffer.from(value,"base64url");
  if(key.length!==32)throw issue(503,"push_encryption_key_missing");
  return key;
}
function credentials(){
  if(process.env.BHS_WEB_PUSH_ENABLED!=="true"||
     !process.env.BHS_FIREBASE_SERVICE_ACCOUNT_JSON||
     !process.env.BHS_SIGNING_SESSION_SECRET||
     !process.env.BHS_WEB_PUSH_PUBLIC_KEY||
     !process.env.BHS_WEB_PUSH_PRIVATE_KEY||
     !process.env.BHS_WEB_PUSH_CONTACT||
     !appSessionReady())
    throw issue(503,"push_not_configured");
  encryptionKey();
  const c=JSON.parse(process.env.BHS_FIREBASE_SERVICE_ACCOUNT_JSON);
  if(c.project_id!==PROJECT)throw issue(503,"wrong_firebase_project");
  const contact=process.env.BHS_WEB_PUSH_CONTACT;
  if(!/^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(contact))
    throw issue(503,"invalid_push_contact");
  return c;
}
function database(){
  const c=credentials();
  // Reuse the existing default Admin app used by /api/app-session.
  // Creating a named-only app would break the legacy server's getFirestore().
  let app=getApps().find(a=>a.name==="[DEFAULT]");
  if(!app)app=initializeApp({credential:cert(c),projectId:PROJECT});
  if(app.options.projectId&&app.options.projectId!==PROJECT)
    throw issue(503,"wrong_active_firebase_project");
  return getFirestore(app);
}
export function pushPublicKey(){
  credentials();
  return process.env.BHS_WEB_PUSH_PUBLIC_KEY;
}
export async function verifiedPushUser(req){
  credentials();
  const session=readAppSession(req);
  if(!session)throw issue(401,"login_required");
  const snap=await userRef(session.userId).get();
  if(!snap.exists||snap.data()?.status==="inactive"||
     appSessionFingerprint(snap.data())!==session.credentialTag)
    throw issue(401,"expired_or_revoked_session");
  return {id:snap.id,...snap.data()};
}
export function sanitizeSubscription(sub){
  if(!sub||typeof sub!=="object"||Array.isArray(sub)||
     Object.keys(sub).some(k=>!["endpoint","expirationTime","keys"].includes(k))||
     typeof sub.endpoint!=="string"||sub.endpoint.length>2048||
     !isPushEndpoint(sub.endpoint)||
     !sub.keys||typeof sub.keys!=="object"||
     typeof sub.keys.p256dh!=="string"||typeof sub.keys.auth!=="string"||
     !/^[A-Za-z0-9_-]{80,120}$/.test(sub.keys.p256dh)||
     !/^[A-Za-z0-9_-]{12,60}$/.test(sub.keys.auth))
    throw issue(400,"invalid_web_push_subscription");
  return {endpoint:sub.endpoint,keys:{
    p256dh:sub.keys.p256dh,auth:sub.keys.auth
  }};
}
function encrypt(sub){
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
  const body=Buffer.concat([cipher.update(JSON.stringify(sub),"utf8"),cipher.final()]);
  return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),
    body.toString("base64url")].join(".");
}
function decrypt(blob){
  const parts=String(blob||"").split(".");
  if(parts.length!==3)throw new Error("invalid_encrypted_subscription");
  const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),
    Buffer.from(parts[0],"base64url"));
  decipher.setAuthTag(Buffer.from(parts[1],"base64url"));
  const raw=Buffer.concat([decipher.update(Buffer.from(parts[2],"base64url")),
    decipher.final()]).toString("utf8");
  return sanitizeSubscription(JSON.parse(raw));
}
export function deviceKey(endpoint){return sha(endpoint);}
export async function savePushDevice(userId,sub){
  const clean=sanitizeSubscription(sub),db=database(),now=Date.now();
  const ref=db.collection(COLLECTION).doc(deviceKey(clean.endpoint));
  await ref.set({
    userId,encrypted:encrypt(clean),updatedAt:now
  },{merge:true});
  // A user may use several devices, but prevent unbounded token buildup.
  const all=await db.collection(COLLECTION).where("userId","==",userId).get();
  const ordered=all.docs.sort((a,b)=>
    Number(b.data().updatedAt||0)-Number(a.data().updatedAt||0));
  const stale=ordered.slice(MAX_DEVICES);
  await Promise.all(stale.map(d=>d.ref.delete()));
  return {success:true,deviceCount:Math.min(ordered.length,MAX_DEVICES)};
}
export async function removePushDevice(userId,endpoint){
  if(typeof endpoint!=="string"||endpoint.length>2048||!isPushEndpoint(endpoint))
    throw issue(400,"invalid_push_endpoint");
  const ref=database().collection(COLLECTION).doc(deviceKey(endpoint));
  const snap=await ref.get();
  if(snap.exists&&snap.data()?.userId===userId)await ref.delete();
  return {success:true};
}

async function sendRecipient(db,userId,payload){
  const snaps=await db.collection(COLLECTION).where("userId","==",userId)
    .limit(MAX_DEVICES).get();
  if(snaps.empty)return {sent:0,failed:0};
  const valid=snaps.docs.map(s=>({doc:s,sub:decrypt(s.data().encrypted)}));
  webpush.setVapidDetails(process.env.BHS_WEB_PUSH_CONTACT,
    process.env.BHS_WEB_PUSH_PUBLIC_KEY,
    process.env.BHS_WEB_PUSH_PRIVATE_KEY);
  const responses=await Promise.all(valid.map(async({doc,sub})=>{
    try{
      await webpush.sendNotification(sub,JSON.stringify(payload),{
        TTL:3600,urgency:"normal",timeout:9000
      });
      return true;
    }catch(err){
      if([404,410].includes(Number(err?.statusCode)))
        await doc.ref.delete().catch(()=>{});
      // Never log subscription endpoints, tokens or school data.
      return false;
    }
  }));
  return {sent:responses.filter(Boolean).length,
    failed:responses.filter(x=>!x).length};
}
async function incomingDocs(db){
  const snap=await db.collection(DOCS_COLLECTION)
    .where("type","==","หนังสือเข้า").get();
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
export async function currentIncomingBadge(user){
  return incomingUnreadCount(await incomingDocs(database()),user);
}

// The server determines actor, document, acknowledgement age and exact count.
// Refresh every subscribed device of this user (including closed PWA windows).
export async function pushAcknowledgementBadge(user,docId){
  if(typeof docId!=="string"||!/^[A-Za-z0-9_-]{1,160}$/.test(docId))
    throw issue(400,"invalid_document_id");
  const db=database(),snap=await db.doc(DOCS_COLLECTION+"/"+docId).get();
  const document=snap.exists?{id:snap.id,...snap.data()}:null;
  if(!recentIncomingAcknowledgement(document,user))
    throw issue(403,"not_your_recent_incoming_acknowledgement");
  const count=incomingUnreadCount(await incomingDocs(db),user);
  const ack=Number(document.acknowledgedAt[user.id]);
  const marker=db.collection(DISPATCHES)
    .doc(sha("badge-ack:"+user.id+":"+docId+":"+ack));
  const claimed=await db.runTransaction(async tx=>{
    const old=await tx.get(marker);
    if(old.exists)return false;
    tx.create(marker,{createdAt:Date.now(),kind:"badge-ack",
      recipientCount:1,state:"claimed"});
    return true;
  });
  if(!claimed)return {success:true,duplicate:true,badgeCount:count};
  const result=await sendRecipient(db,user.id,{
    title:"BHS E-Document",
    body:"จำนวนหนังสือเข้าค้างของคุณได้รับการอัปเดต",
    url:"/",kind:"badge-sync",tag:"bhs-badge-sync",badgeCount:count
  });
  await marker.update({state:"complete",sent:result.sent,failed:result.failed,
    finishedAt:Date.now()});
  return {success:true,duplicate:false,badgeCount:count,...result};
}

export async function pushSchoolEvent(event,users=[]){
  const db=database(),marker=db.collection(DISPATCHES)
    .doc(sha(event.key));
  // Server-computed event key. At-most-once to avoid notification spam or
  // charging up accidental repeated broadcasts across many browser tabs.
  const claimed=await db.runTransaction(async tx=>{
    const snap=await tx.get(marker);
    if(snap.exists)return false;
    tx.create(marker,{createdAt:Date.now(),kind:event.kind,
      recipientCount:event.recipientIds.length,state:"claimed"});
    return true;
  });
  if(!claimed)return {success:true,duplicate:true};
  const payload={
    title:"BHS E-Document",
    body:event.title,
    url:"/?doc="+encodeURIComponent(event.docId),
    tag:"bhs-event-"+sha(event.key).slice(0,20)
  };
  // One Firestore document query for all recipients, not one per device.
  // If the badge query fails, normal Web Push delivery still proceeds.
  let docs=null;
  try{docs=await incomingDocs(db)}catch{}
  const byUser=new Map(users.map(u=>[u.id,u]));
  let sent=0,failed=0;
  // Avoid noisy spikes from accidental routing to many people at once.
  for(let i=0;i<event.recipientIds.length;i+=10){
    const group=event.recipientIds.slice(i,i+10);
    const results=await Promise.all(group.map(uid=>{
      const user=byUser.get(uid);
      const badgeCount=docs&&user?incomingUnreadCount(docs,user):null;
      const personalized=badgeCount!==null?{
        ...payload,
        badgeCount,
        // Display a useful count in Android's notification shade because
        // Chrome-installed PWAs cannot force a numeric launcher icon badge.
        body:event.incomingPublished&&badgeCount>0?
          "มีหนังสือเข้ารอรับทราบ "+badgeCount+" เรื่อง":payload.body
      }:payload;
      return sendRecipient(db,uid,personalized).catch(()=>({sent:0,failed:1}));
    }));
    for(const result of results){sent+=result.sent;failed+=result.failed;}
  }
  await marker.update({state:"complete",sent,failed,finishedAt:Date.now()});
  return {success:true,duplicate:false,sent,failed};
}
export async function loadEventDocument(docId){
  if(typeof docId!=="string"||!/^[A-Za-z0-9_-]{1,160}$/.test(docId))
    throw issue(400,"invalid_document_id");
  const db=database();
  const [docSnap,usersSnap,settingsSnap]=await Promise.all([
    db.doc("artifacts/bhs-edoc-app/public/data/bhs_documents/"+docId).get(),
    db.collection("artifacts/bhs-edoc-app/public/data/bhs_users").get(),
    db.doc("artifacts/bhs-edoc-app/public/data/bhs_settings/system").get()
  ]);
  if(!docSnap.exists)throw issue(404,"document_not_found");
  return {
    doc:{id:docSnap.id,...docSnap.data()},
    users:usersSnap.docs.map(u=>({id:u.id,...u.data()})),
    settings:settingsSnap.exists?settingsSnap.data():{}
  };
}
