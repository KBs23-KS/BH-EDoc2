/**
 * Preparation-only directory endpoint.
 *
 * The current client reads all BHS accounts before login, including plaintext
 * passwords. The future client must call this endpoint ONLY after a verified
 * session and use the returned whitelisted profiles instead.
 *
 * Disabled in production and by default; no migration is performed here.
 */
import {
  fail,forbidCrossSite,readAppSession,appSessionReady,appSessionFingerprint,isolatedSchoolPreview,
  userRef,setupResponse
} from "./_signatureServer.js";
import {browserSchoolDirectory} from "../shared/schoolProfile.js";

const USERS_COLLECTION="artifacts/bhs-edoc-app/public/data/bhs_users";
export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="GET")return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(!isolatedSchoolPreview()||process.env.VERCEL_ENV==="production"||process.env.BHS_ENABLE_SECURE_DIRECTORY_PREVIEW!=="true")
    return fail(res,503,"บริการบัญชีแบบใหม่ยังไม่เปิดใช้งาน");
  if(!appSessionReady())return fail(res,503,"บริการยืนยันตัวตนยังไม่พร้อม");
  try{
    const session=readAppSession(req);
    if(!session)return fail(res,401,"กรุณาเข้าสู่ระบบ");
    const snap=await userRef(session.userId).get();
    if(!snap.exists||snap.data()?.status==="inactive"||
       appSessionFingerprint(snap.data())!==session.credentialTag)
      return fail(res,401,"บัญชีหรือเซสชันไม่ถูกต้อง");
    const role=snap.data().role;
    const list=await snap.ref.firestore.collection(USERS_COLLECTION).get();
    const records=list.docs.map(x=>({id:x.id,data:x.data()}));
    const users=browserSchoolDirectory(records,role);
    return res.status(200).json({success:true,users});
  }catch(err){
    console.error("Directory exchange failed",err?.code||"unavailable");
    return fail(res,503,"ไม่สามารถโหลดรายชื่อผู้ใช้งานได้");
  }
}
