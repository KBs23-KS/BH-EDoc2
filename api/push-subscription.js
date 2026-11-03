/** Server-only FCM registrations. No tokens are stored in publicly readable Firestore paths. */
import {createHash} from "node:crypto";
import {fail,forbidCrossSite,readAppSession,appSessionFingerprint,userRef,setupResponse} from "./_signatureServer.js";

export const TOKEN_COLLECTION="artifacts/bhs-edoc-app/public/data/bhs_push_subscriptions";
export const EVENT_COLLECTION="artifacts/bhs-edoc-app/public/data/bhs_push_events";

export function tokenId(token){return createHash("sha256").update(token).digest("hex");}
export function isFcmToken(value){
  return typeof value==="string"&&value.length>=50&&value.length<=4096&&/^[a-zA-Z0-9:_\-.]+$/.test(value);
}
export async function authenticatedProfile(req){
  const session=readAppSession(req);
  if(!session)return null;
  const snap=await userRef(session.userId).get();
  if(!snap.exists||snap.data()?.status==="inactive"||appSessionFingerprint(snap.data())!==session.credentialTag)return null;
  return {id:snap.id,...snap.data()};
}
export const serverDb=()=>userRef("_reference").firestore;

export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(!["POST","DELETE"].includes(req.method))return fail(res,405,"ไม่รองรับคำขอนี้");
  try{
    const user=await authenticatedProfile(req);
    if(!user)return fail(res,401,"กรุณาเข้าสู่ระบบอีกครั้ง");
    const token=req.body?.token;
    if(!isFcmToken(token))return fail(res,400,"ข้อมูลอุปกรณ์ไม่ถูกต้อง");
    const ref=serverDb().collection(TOKEN_COLLECTION).doc(tokenId(token));
    if(req.method==="POST"){
      // An installation may be used by a different school account later.
      // Re-registering transfers delivery to the current authenticated owner.
      await ref.set({
        token,userId:user.id,updatedAt:Date.now(),
        platform:"web",version:1
      });
      return res.status(200).json({success:true});
    }
    const existing=await ref.get();
    if(existing.exists&&existing.data().userId===user.id)await ref.delete();
    return res.status(200).json({success:true});
  }catch(err){
    console.error("Push registration error",err?.message);
    return fail(res,503,"ไม่สามารถบันทึกอุปกรณ์แจ้งเตือนได้");
  }
}
