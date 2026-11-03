/**
 * PREPARATION-ONLY endpoint for BHS school identities.
 *
 * Creates a short-lived Firebase custom sign-in token ONLY for an existing,
 * server-verified, HttpOnly application session. It cannot be invoked using
 * an anonymous Firebase account, username, or password alone.
 *
 * Disabled in every environment unless explicitly enabled server-side.
 * Do not enable on the live system before moving passwords out of readable
 * documents and testing least-privilege Firestore Rules.
 */
import {getAuth as getAdminAuth} from "firebase-admin/auth";
import {
  appSessionReady,appSessionFingerprint,forbidCrossSite,readAppSession,
  userRef,setupResponse,fail
} from "./_signatureServer.js";
import {canExchangeSchoolIdentity,schoolIdentityClaims} from "../shared/identityPolicy.js";

export default async function handler(req,res) {
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="GET")return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(process.env.VERCEL_ENV==="production"||process.env.BHS_ENABLE_CUSTOM_AUTH_PREVIEW!=="true")
    return fail(res,503,"บริการยืนยันตัวตนใหม่ยังไม่เปิดใช้งาน");
  if(!appSessionReady())
    return fail(res,503,"บริการยืนยันตัวตนไม่พร้อม");
  try {
    const session=readAppSession(req);
    if(!session)return fail(res,401,"กรุณาเข้าสู่ระบบ");
    const userSnap=await userRef(session.userId).get();
    if(!userSnap.exists)return fail(res,401,"ไม่พบบัญชีผู้ใช้");
    const user={id:userSnap.id,...userSnap.data()};
    if(!canExchangeSchoolIdentity(session,user,appSessionFingerprint(user)))
      return fail(res,401,"บัญชีนี้ไม่มีสิทธิ์เข้าใช้งาน");
    // Existing user document IDs are stable across device and role changes.
    const customToken=await getAdminAuth().createCustomToken(user.id,schoolIdentityClaims());
    return res.status(200).json({uid:user.id,customToken});
  }catch(err){
    // Avoid leaking service-account paths, tokens or school credentials in logs.
    console.error("Custom identity exchange error",err?.code||"unavailable");
    return fail(res,503,"ไม่สามารถเตรียมบัญชียืนยันตัวตนได้");
  }
}
