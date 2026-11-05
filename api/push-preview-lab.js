/**
 * Isolated, opt-in push delivery laboratory for Draft PR #46.
 * Not the school notification API. No user records or school documents.
 * The only allowed Firestore project is bhs-edoc-security-test.
 */
import {createHash,randomBytes,createCipheriv,createDecipheriv,timingSafeEqual} from "node:crypto";
import {initializeApp,getApps,cert} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import webpush from "web-push";

const BRANCH="feature/free-pwa-push-notifications-20261104";
const PROJECT="bhs-edoc-security-test";
const DEVICES="bhs_push_lab_devices";
const COUNTERS="bhs_push_lab_counters";
const RETENTION_MS=24*60*60*1000;
const MAX_SENDS_PER_DEVICE=10;
const MAX_SENDS_GLOBAL=60;
const MAX_REGISTRATIONS_GLOBAL=40;
const COOLDOWN_MS=60*1000;
const hex=value=>createHash("sha256").update(value).digest("hex");
const issue=(status,message,details={})=>Object.assign(new Error(message),{status,...details});
export function labCooldownSeconds(now,lastSentAt) {
  return Math.max(0,Math.ceil((COOLDOWN_MS-(now-Number(lastSentAt||0)))/1000));
}
export function makeLabPushPayload(){
  return {
    title:"BHS Push Test",
    body:"Web Push ทดสอบจาก Firebase แยก (ไม่มีเอกสารจริง)",
    url:"/push-preview-lab.html",
    // Fresh tag for each accepted send. A fixed tag replaces the previous
    // notification without showing a new popup in Chrome (renotify:false).
    tag:"bhs-push-lab-"+randomBytes(8).toString("hex"),
    badge:1
  };
}
function safeCompare(left,right) {
  if(!/^[0-9a-f]{64}$/.test(String(left))||!/^[0-9a-f]{64}$/.test(String(right)))return false;
  return timingSafeEqual(Buffer.from(left,"hex"),Buffer.from(right,"hex"));
}
function previewGuard() {
  if(process.env.VERCEL_ENV!=="preview"||
     process.env.VERCEL_GIT_COMMIT_REF!==BRANCH)throw issue(404,"ไม่มีบริการนี้");
  if(process.env.BHS_PUSH_LAB_ENABLED!=="true")throw issue(503,"ยังไม่ได้เปิดห้องทดสอบ");
}
function configured() {
  previewGuard();
  const expected=["BHS_PUSH_LAB_FIREBASE_ADMIN_JSON",
    "BHS_PUSH_LAB_VAPID_PUBLIC_KEY","BHS_PUSH_LAB_VAPID_PRIVATE_KEY",
    "BHS_PUSH_LAB_VAPID_CONTACT","BHS_PUSH_LAB_ENCRYPTION_KEY"];
  if(expected.some(key=>!process.env[key])||
     process.env.BHS_PUSH_LAB_RULES_VERIFIED!=="true")
    throw issue(503,"ห้องทดสอบรอการตั้งค่า Firebase และตรวจ Rules");
  let config;
  try{config=JSON.parse(process.env.BHS_PUSH_LAB_FIREBASE_ADMIN_JSON);}
  catch{throw issue(503,"รูปแบบ Firebase Test credential ไม่ถูกต้อง");}
  if(config?.project_id!==PROJECT)throw issue(503,"ต้องใช้ Firebase ทดสอบเท่านั้น");
  const key=Buffer.from(process.env.BHS_PUSH_LAB_ENCRYPTION_KEY,"base64url");
  if(key.length!==32)throw issue(503,"คีย์เข้ารหัสไม่ถูกต้อง");
  if(!/^[A-Za-z0-9_-]{75,100}$/.test(process.env.BHS_PUSH_LAB_VAPID_PUBLIC_KEY)||
     !/^[A-Za-z0-9_-]{40,70}$/.test(process.env.BHS_PUSH_LAB_VAPID_PRIVATE_KEY))
    throw issue(503,"VAPID keys ไม่ถูกต้อง");
  if(!/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(process.env.BHS_PUSH_LAB_VAPID_CONTACT))
    throw issue(503,"Push contact ไม่ถูกต้อง");
  return {config,key};
}
function database(config) {
  const name="bhs-push-lab-isolated";
  let app=getApps().find(a=>a.name===name);
  if(!app)app=initializeApp({credential:cert(config),projectId:PROJECT},name);
  if(app.options.projectId!==PROJECT)throw issue(503,"Firebase test project ไม่ตรง");
  return getFirestore(app);
}
function hostAllowed(endpoint){
  try {
    const x=new URL(endpoint);
    return x.protocol==="https:"&&!x.username&&!x.password&&!x.port&&
      (["fcm.googleapis.com","android.googleapis.com",
        "updates.push.services.mozilla.com","push.apple.com"].includes(x.hostname)||
       x.hostname.endsWith(".push.apple.com"));
  }catch{return false;}
}
function validSubscription(input) {
  if(!input||typeof input!=="object"||Array.isArray(input)||
     Object.keys(input).some(x=>!["endpoint","expirationTime","keys"].includes(x))||
     typeof input.endpoint!=="string"||input.endpoint.length>2048||
     !hostAllowed(input.endpoint)||
     !input.keys||typeof input.keys!=="object"||
     typeof input.keys.p256dh!=="string"||
     typeof input.keys.auth!=="string"||
     !/^[A-Za-z0-9_-]{80,120}$/.test(input.keys.p256dh)||
     !/^[A-Za-z0-9_-]{12,60}$/.test(input.keys.auth))
    throw issue(400,"ข้อมูลอุปกรณ์ไม่ถูกต้อง");
  return {endpoint:input.endpoint,keys:{
    p256dh:input.keys.p256dh,auth:input.keys.auth
  }};
}
function encrypt(sub,key) {
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);
  const raw=Buffer.concat([cipher.update(JSON.stringify(sub)),cipher.final()]);
  return [iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    raw.toString("base64url")].join(".");
}
function decrypt(blob,key) {
  const pieces=String(blob||"").split(".");
  if(pieces.length!==3)throw issue(503,"ข้อมูลอุปกรณ์เสียหาย");
  const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(pieces[0],"base64url"));
  decipher.setAuthTag(Buffer.from(pieces[1],"base64url"));
  const raw=Buffer.concat([decipher.update(Buffer.from(pieces[2],"base64url")),decipher.final()]);
  return validSubscription(JSON.parse(raw.toString("utf8")));
}
const validateIdAndToken=data=>{
  if(!/^[0-9a-f]{64}$/.test(String(data?.deviceId||""))||
     !/^[A-Za-z0-9_-]{32,64}$/.test(String(data?.token||"")))
    throw issue(400,"ข้อมูลยืนยันอุปกรณ์ไม่ถูกต้อง");
};
const rateRef=(db,type,day)=>db.collection(COUNTERS).doc(type+"-"+day);
const today=()=>new Date().toISOString().slice(0,10);
async function registration(db,sub,key) {
  const id=hex(sub.endpoint),token=randomBytes(32).toString("base64url"),now=Date.now();
  const dev=db.collection(DEVICES).doc(id),quota=rateRef(db,"register",today());
  await db.runTransaction(async tx=>{
    const count=await tx.get(quota);
    if((count.data()?.count||0)>=MAX_REGISTRATIONS_GLOBAL)
      throw issue(429,"จำนวนทดสอบวันนี้ครบแล้ว");
    tx.set(quota,{count:(count.data()?.count||0)+1,updatedAt:now},{merge:true});
    tx.set(dev,{secretHash:hex(token),encrypted:encrypt(sub,key),
      expiresAt:now+RETENTION_MS,lastSentAt:0,sendDay:"",sendCount:0,createdAt:now});
  });
  return {success:true,deviceId:id,token,expiresInHours:24};
}
async function dispatch(db,data,key) {
  validateIdAndToken(data);
  const dev=db.collection(DEVICES).doc(data.deviceId);
  const now=Date.now(),day=today(),quota=rateRef(db,"send",day);
  let subBlob;
  await db.runTransaction(async tx=>{
    const snapshot=await tx.get(dev);
    const record=snapshot.data();
    if(!record||!safeCompare(record.secretHash,hex(data.token))||
       record.expiresAt<=now)throw issue(403,"อุปกรณ์ไม่ได้ลงทะเบียนหรือหมดอายุ");
    const count=await tx.get(quota);
    const sent=record.sendDay===day?record.sendCount||0:0;
    const remaining=labCooldownSeconds(now,record.lastSentAt);
    if(remaining>0)
      throw issue(429,"กรุณารออีก "+remaining+" วินาทีก่อนส่งซ้ำ",
        {retryAfterSeconds:remaining});
    if(sent>=MAX_SENDS_PER_DEVICE||
       (count.data()?.count||0)>=MAX_SENDS_GLOBAL)
      throw issue(429,"โควตาการทดสอบวันนี้ครบแล้ว");
    subBlob=record.encrypted;
    tx.update(dev,{lastSentAt:now,sendDay:day,sendCount:sent+1});
    tx.set(quota,{count:(count.data()?.count||0)+1,updatedAt:now},{merge:true});
  });
  const sub=decrypt(subBlob,key);
  webpush.setVapidDetails(process.env.BHS_PUSH_LAB_VAPID_CONTACT,
    process.env.BHS_PUSH_LAB_VAPID_PUBLIC_KEY,
    process.env.BHS_PUSH_LAB_VAPID_PRIVATE_KEY);
  try{
    await webpush.sendNotification(sub,JSON.stringify(makeLabPushPayload()),
      {TTL:120,urgency:"normal",timeout:9000});
    return {success:true,queued:true,
      retryAfterSeconds:labCooldownSeconds(Date.now(),now)};
  }catch(error){
    if([404,410].includes(Number(error?.statusCode)))await dev.delete().catch(()=>{});
    throw issue(502,"บริการ Push ไม่รับข้อความทดสอบ โปรดสมัครอุปกรณ์ใหม่");
  }
}
async function deregister(db,data) {
  validateIdAndToken(data);
  const dev=db.collection(DEVICES).doc(data.deviceId),snap=await dev.get();
  if(snap.exists&&safeCompare(snap.data().secretHash,hex(data.token)))
    await dev.delete();
  return {success:true};
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, private");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","DENY");
  const respond=(status,data)=>res.status(status).json(data);
  try{
    previewGuard();
    if(!["GET","POST"].includes(req.method))
      return respond(405,{success:false,error:"ไม่รองรับวิธีเรียก"});
    if(req.method==="POST"){
      const host=String(req.headers["x-forwarded-host"]||req.headers.host||"").toLowerCase();
      const origin=String(req.headers.origin||"");
      if(!origin||origin!=="https://"+host||
         req.headers["sec-fetch-site"]==="cross-site")
        throw issue(403,"ต้องเรียกจากหน้า Preview ต้นทางเดียวกัน");
      if(!String(req.headers["content-type"]||"").toLowerCase().startsWith("application/json"))
        throw issue(415,"ต้องเป็นข้อมูล JSON");
      if(!req.body||typeof req.body!=="object"||Array.isArray(req.body)||
         JSON.stringify(req.body).length>4500)throw issue(400,"ข้อมูลใหญ่หรือไม่ถูกต้อง");
    }
    const {config,key}=configured();
    if(req.method==="GET")return respond(200,{
      success:true,ready:true,project:"bhs-edoc-security-test",
      publicKey:process.env.BHS_PUSH_LAB_VAPID_PUBLIC_KEY
    });
    const db=database(config),data=req.body;
    if(data.action==="register")
      return respond(200,await registration(db,validSubscription(data.subscription),key));
    if(data.action==="send")
      return respond(200,await dispatch(db,data,key));
    if(data.action==="remove")
      return respond(200,await deregister(db,data));
    return respond(400,{success:false,error:"คำสั่งไม่ถูกต้อง"});
  }catch(err){
    const status=[400,403,404,405,415,429,502,503].includes(err?.status)?err.status:503;
    return respond(status,{success:false,ready:false,error:
      status===503?"ห้องทดสอบยังไม่พร้อม: รอ Firebase ทดสอบและตรวจ Rules":
      status===404?"ไม่เปิดบริการนี้ในสภาพแวดล้อมนี้":
      status===429?err.message:
      status===403?"ไม่มีสิทธิ์ทดสอบอุปกรณ์นี้":
      status===502?err.message:"คำขอทดสอบไม่สำเร็จ",
      ...(status===429&&Number.isInteger(err?.retryAfterSeconds)?
        {retryAfterSeconds:err.retryAfterSeconds}:{})});
  }
}
