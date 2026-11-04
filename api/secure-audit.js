/** Isolated school Audit Log — server access only; no Firestore client list. */
import {fail,forbidCrossSite,setupResponse}
  from "./_signatureServer.js";
import {
  secureApiPreviewReady,requirePreviewSchoolSession,secureApiResponse
} from "./_schoolSessionGuard.js";

const ROOT="artifacts/bhs-edoc-app/public/data/";
const ALLOWED=["action","userId","userName","role","targetType","targetId","detail","timestamp"];
export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="GET")return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(!secureApiPreviewReady("BHS_ENABLE_SECURE_AUDIT_PREVIEW"))
    return secureApiResponse(res,503);
  try{
    const {user,db}=await requirePreviewSchoolSession(req);
    if(user.role!=="admin")return secureApiResponse(res,403);
    const result=await db.collection(ROOT+"bhs_audit_logs")
      .orderBy("timestamp","desc").limit(300).get();
    const records=result.docs.map(entry=>{
      const record=entry.data(),safe={id:entry.id};
      for(const key of ALLOWED)if(record[key]!==undefined){
        const value=record[key];
        // Old records can be malformed; strip unexpected nested objects.
        if(["string","number","boolean"].includes(typeof value))
          safe[key]=value;
      }
      return safe;
    });
    return res.status(200).json({success:true,logs:records});
  }catch(e){
    if(e?.status===401)return secureApiResponse(res,401);
    console.error("Secure Audit Log unavailable",e?.code||"unavailable");
    return secureApiResponse(res,503);
  }
}
