/** Server-side, same-origin PDF signing access. Never import from browser code.
 * Requires Firebase Admin service account, strong HMAC key and GAS Backup secret
 * in Vercel's encrypted Environment Variables. None is exposed to Vite.
 */
import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import {getApps,initializeApp,cert} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";

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
export function ready(){
  return Boolean(process.env.BHS_FIREBASE_SERVICE_ACCOUNT_JSON&&process.env.BHS_SIGNING_SESSION_SECRET?.length>=32&&process.env.BHS_BACKUP_SECRET);
}
function adminDb(){
  if(!process.env.BHS_FIREBASE_SERVICE_ACCOUNT_JSON)throw new Error("Firebase Admin ยังไม่ได้ตั้งค่า");
  if(!getApps().length){
    const parsed=JSON.parse(process.env.BHS_FIREBASE_SERVICE_ACCOUNT_JSON);
    if(parsed.project_id!=="bhs-edoc-2")throw new Error("Firebase project ไม่ตรงกับระบบ");
    initializeApp({credential:cert(parsed)});
  }
  return getFirestore();
}
export function userRef(id){return adminDb().doc(COLLECTION+"/bhs_users/"+id);}
export function documentRef(id){return adminDb().doc(COLLECTION+"/bhs_documents/"+id);}
export async function findByUsername(username){
  const q=await adminDb().collection(COLLECTION+"/bhs_users").where("username","==",username).limit(2).get();
  if(q.size!==1)return null;
  return {id:q.docs[0].id,...q.docs[0].data()};
}
function sign(payload){
  return createHmac("sha256",process.env.BHS_SIGNING_SESSION_SECRET).update(payload).digest("base64url");
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
  // Temporary bridge to existing stored passwords; replace with Firebase Auth
  // before tightening Firestore Rules and migrating passwords.
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
