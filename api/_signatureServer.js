/** Server-side, same-origin PDF signing access. Never import from browser code.
 * Requires Firebase Admin service account, strong HMAC key and GAS Backup secret
 * in Vercel's encrypted Environment Variables. None is exposed to Vite.
 */
import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import {getApps,initializeApp,cert} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {getAuth as getFirebaseAdminAuth} from "firebase-admin/auth";
import {findUniqueUsernameAccount} from "../shared/username.js";

const COOKIE="bhs_signing_session";
const COLLECTION="artifacts/bhs-edoc-app/public/data";
const MAX_SESSION_MS=30*60*1000;
const originMatches=req=>{
  const origin=req.headers.origin;
  if(!origin)return true; // native, same-origin callers without Origin
  try{
    const u=new URL(origin);
    const host=String(req.headers["x-forwarded-host"]||req.headers.host||"").toLowerCase();
    return u.protocol==="https:"&&u.host.toLowerCase()===host;
  }catch{return false;}
};
export function setupResponse(res){
  res.setHeader("Cache-Control","no-store, private");
  res.setHeader("X-Content-Type-Options","nosniff");
}
export function fail(res,status,message){setupResponse(res);return res.status(status).json({success:false,error:message});}
export const forbidCrossSite=(req,res)=>originMatches(req)?false:(fail(res,403,"คำขอไม่ได้มาจากเว็บไซต์โรงเรียน"),true);
export function isolatedSchoolPreview(){
  return process.env.BHS_SERVER_ISOLATED_PREVIEW==="true"&&
    process.env.VERCEL_ENV!=="production"&&
    process.env.FIRESTORE_EMULATOR_HOST==="127.0.0.1:8099";
}
const adminAccountJson=()=>isolatedSchoolPreview()?
  process.env.BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON:
  process.env.BHS_FIREBASE_SERVICE_ACCOUNT_JSON;
const serverSessionSecret=()=>isolatedSchoolPreview()?
  process.env.BHS_TEST_SESSION_SECRET:
  process.env.BHS_SIGNING_SESSION_SECRET;
const anyIsolatedFeatureRequested=()=>process.env.VERCEL_ENV!=="production"&&
  ["BHS_ENABLE_CUSTOM_AUTH_PREVIEW","BHS_ENABLE_SECURE_DIRECTORY_PREVIEW",
    "BHS_ENABLE_SECURE_DATA_PREVIEW","BHS_ENABLE_SECURE_ROUTING_PREVIEW",
    "BHS_ENABLE_SECURE_WORKFLOW_PREVIEW",
    "BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW",
    "BHS_ENABLE_SECURE_USERS_PREVIEW",
    "BHS_ENABLE_SECURE_DOCUMENTS_PREVIEW",
    "BHS_ENABLE_SECURE_AUDIT_PREVIEW"].some(name=>process.env[name]==="true");
export function ready(){
  // Never permit real school PDF signing in any isolated security rehearsal,
  // including a partially misconfigured preview with a production admin key.
  return process.env.BHS_SERVER_ISOLATED_PREVIEW!=="true"&&
    !isolatedSchoolPreview()&&!anyIsolatedFeatureRequested() &&
    Boolean(process.env.BHS_FIREBASE_SERVICE_ACCOUNT_JSON&&
      process.env.BHS_SIGNING_SESSION_SECRET?.length>=32&&process.env.BHS_BACKUP_SECRET);
}
function serverAdminApp(){
  if(process.env.BHS_SERVER_ISOLATED_PREVIEW==="true"&&
     !isolatedSchoolPreview())
    throw new Error("ห้ามเชื่อม Backend ทดสอบนอก Firestore Emulator");
  const raw=adminAccountJson();
  if(!raw)throw new Error("Firebase Admin ยังไม่ได้ตั้งค่า");
  const parsed=JSON.parse(raw);
  const expected=isolatedSchoolPreview()?"bhs-edoc-security-test":"bhs-edoc-2";
  if(parsed.project_id!==expected)throw new Error("Firebase project ไม่ตรงกับระบบ");
  const name="bhs-school-admin-"+expected;
  const existing=getApps().find(app=>app.name===name);
  if(existing){
    if(existing.options.projectId!==expected)throw new Error("Firebase Admin identity ไม่ตรง");
    return existing;
  }
  return initializeApp({credential:cert(parsed),projectId:expected},name);
}
export function adminDb(){return getFirestore(serverAdminApp());}
export function serverAdminAuth(){return getFirebaseAdminAuth(serverAdminApp());}
export function schoolAdminProjectId(){return serverAdminApp().options.projectId;}
export function userRef(id){return adminDb().doc(COLLECTION+"/bhs_users/"+id);}
export function documentRef(id){return adminDb().doc(COLLECTION+"/bhs_documents/"+id);}
export async function findByUsername(username){
  // Existing Firestore usernames have mixed-case storage and no normalized index.
  // Check all school accounts so a lowercase login matches the original profile;
  // if two legacy accounts differ only in case, reject rather than select either.
  const users=await adminDb().collection(COLLECTION+"/bhs_users").get();
  return findUniqueUsernameAccount(
    users.docs.map(doc=>({id:doc.id,...doc.data()})),
    username
  );
}
function sign(payload){
  const secret=serverSessionSecret();
  if(typeof secret!=="string"||secret.length<32)
    throw new Error("Session secret not configured");
  return createHmac("sha256",secret).update(payload).digest("base64url");
}
export function makeSession(userId){
  const body=Buffer.from(JSON.stringify({userId,exp:Date.now()+MAX_SESSION_MS,nonce:randomBytes(12).toString("hex")})).toString("base64url");
  return body+"."+sign(body);
}
export function readSession(req){
  if(!process.env.BHS_SIGNING_SESSION_SECRET||process.env.BHS_SIGNING_SESSION_SECRET.length<32)return null;
  const raw=String(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="));
  const value=raw?.slice(COOKIE.length+1);
  if(!value||value.length>1024)return null;
  const [body,mac,...more]=value.split(".");
  if(more.length||!body||!mac)return null;
  const actual=Buffer.from(mac,"base64url"),expected=Buffer.from(sign(body),"base64url");
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
  try{
    const data=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));
    if(!data.userId||data.exp<=Date.now()||data.exp>Date.now()+MAX_SESSION_MS)return null;
    return data.userId;
  }catch{return null;}
}
export function setSessionCookie(res,value){
  res.setHeader("Set-Cookie",COOKIE+"="+value+"; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=1800");
}
export function clearSessionCookie(res){
  res.setHeader("Set-Cookie",COOKIE+"=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
}
export function matchesLegacyPassword(given,user) {
  // A migrated account MUST NEVER fall back to "123456" or a stale
  // plaintext password when the isolated vault flag is disabled.
  if(user?.credentialVersion)return false;
  // Temporary bridge for unmigrated legacy users only.
  if(typeof given!=="string"||given.length>128)return false;
  const actual=String(user.password||"123456");
  const a=createHmac("sha256","legacy-bhs-compare").update(given).digest();
  const b=createHmac("sha256","legacy-bhs-compare").update(actual).digest();
  return timingSafeEqual(a,b);
}
export function allowedToSign(user,document,driveId){
  if(!user||!document||user.status==="inactive"||document.isDeleted)return false;
  if(!["director","admin"].includes(user.role))return false;
  if(document.status!=="รอผู้อำนวยการ")return false;
  if(!["คำสั่งโรงเรียน","หนังสือเวียนแจ้งรับทราบ"].includes(document.type))return false;
  return (document.files||[]).some(f=>f.driveId===driveId&&(f.type==="PDF"||String(f.name||"").toLowerCase().endsWith(".pdf")));
}

/**
 * Separate non-signing website session. Never accepted by readSession() or allowedToSign().
 * 7 days only when explicitly remembered; otherwise an in-browser-session cookie.
 */
const APP_COOKIE="bhs_app_session";
const MAX_APP_MS=7*24*60*60*1000;
export function appSessionReady(){
  if(process.env.BHS_SERVER_ISOLATED_PREVIEW==="true" &&
     !isolatedSchoolPreview())return false;
  if(anyIsolatedFeatureRequested()&&!isolatedSchoolPreview())return false;
  return Boolean(adminAccountJson()&&serverSessionSecret()?.length>=32);
}
export const appSessionFingerprint = user =>
  sign("bhs-app-session-user-v1:"+String(user?.username||"")+":"+
       // Once a private vault is activated, the public profile no longer
       // contains a password. A random version revokes old sessions safely.
       (typeof user?.credentialVersion==="string"&&user.credentialVersion.length>=24
         ?"vault:"+user.credentialVersion
         :String(user?.password||"123456"))+
       ":"+String(user?.role||"")).slice(0,24);
export function makeAppSession(userId,credentialTag){
  const body=Buffer.from(JSON.stringify({
    kind:"app",userId,credentialTag,exp:Date.now()+MAX_APP_MS,nonce:randomBytes(12).toString("hex")
  })).toString("base64url");
  return body+"."+sign(body);
}
export function readAppSession(req){
  if(!appSessionReady())return null;
  const raw=String(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(APP_COOKIE+"="));
  const value=raw?.slice(APP_COOKIE.length+1);
  if(!value||value.length>1024)return null;
  const [body,mac,...more]=value.split(".");
  if(more.length||!body||!mac)return null;
  let actual;
  try{actual=Buffer.from(mac,"base64url");}catch{return null;}
  const expected=Buffer.from(sign(body),"base64url");
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
  try{
    const data=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));
    if(data.kind!=="app"||typeof data.userId!=="string"||!data.userId||
      typeof data.credentialTag!=="string"||data.credentialTag.length!==24||
      data.exp<=Date.now()||data.exp>Date.now()+MAX_APP_MS)return null;
    return {userId:data.userId,credentialTag:data.credentialTag};
  }catch{return null;}
}
export function setAppSessionCookie(res,token,remember){
  res.setHeader("Set-Cookie",APP_COOKIE+"="+token+"; Path=/api; HttpOnly; Secure; SameSite=Strict"+(remember?"; Max-Age=604800":""));
}
export function clearAppSessionCookie(res){
  res.setHeader("Set-Cookie",APP_COOKIE+"=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
}
