/**
 * Shared server-only cookie/session check for BHS security migration APIs.
 * Bounded to the ISOLATED test Firebase project, never the live school.
 */
import {
  isolatedSchoolPreview,appSessionReady,readAppSession,appSessionFingerprint,
  userRef,adminDb
} from "./_signatureServer.js";
export function secureApiPreviewReady(feature){
  return process.env.VERCEL_ENV!=="production" &&
    isolatedSchoolPreview() &&
    process.env[feature]==="true" &&
    appSessionReady();
}
export async function requirePreviewSchoolSession(req){
  if(!isolatedSchoolPreview()||process.env.VERCEL_ENV==="production")
    throw Object.assign(new Error("unavailable"),{status:503});
  const session=readAppSession(req);
  if(!session)throw Object.assign(new Error("unauthenticated"),{status:401});
  const snap=await userRef(session.userId).get();
  if(!snap.exists)throw Object.assign(new Error("unauthenticated"),{status:401});
  const data=snap.data();
  if(data?.status==="inactive" ||
     !["admin","director","deputy","clerk","teacher"].includes(data?.role) ||
     appSessionFingerprint(data)!==session.credentialTag)
    throw Object.assign(new Error("unauthenticated"),{status:401});
  return {user:{id:snap.id,...data},db:adminDb()};
}
export function secureApiResponse(res,status=503){
  return res.status(status).json({
    success:false,error:status===401?"กรุณาเข้าสู่ระบบอีกครั้ง":
      status===403?"ไม่มีสิทธิ์ดำเนินการ":
      status===400?"ข้อมูลคำขอไม่ถูกต้อง":"บริการทดสอบยังไม่พร้อมใช้งาน"
  });
}
export function enforceJsonSameOrigin(req){
  if(req.method!=="POST"||
     !String(req.headers?.["content-type"]||"").toLowerCase().startsWith("application/json")||
     ["cross-site","same-site"].includes(req.headers?.["sec-fetch-site"]))
    return false;
  return true;
}
