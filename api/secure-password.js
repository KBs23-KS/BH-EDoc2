/**
 * Authenticated user-initiated password change, isolated emulator only.
 * Requires current password and an active server-verified school session.
 */
import {fail,forbidCrossSite,setupResponse,schoolAdminProjectId}
  from "./_signatureServer.js";
import {
  requirePreviewSchoolSession,secureApiPreviewReady,
  secureApiResponse,enforceJsonSameOrigin
} from "./_schoolSessionGuard.js";
import {changeSyntheticOwnPassword} from "./_secureSelfPassword.js";
export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="POST")return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(!secureApiPreviewReady("BHS_ENABLE_SECURE_PASSWORD_PREVIEW"))
    return secureApiResponse(res,503);
  if(!enforceJsonSameOrigin(req))return secureApiResponse(res,403);
  const data=req.body;
  if(!data||typeof data!=="object"||Array.isArray(data)||
     Object.keys(data).some(k=>!["currentPassword","newPassword"].includes(k))||
     JSON.stringify(data).length>1500||
     typeof data.currentPassword!=="string"||
     typeof data.newPassword!=="string")
    return secureApiResponse(res,400);
  try{
    const {user,db}=await requirePreviewSchoolSession(req);
    const result=await changeSyntheticOwnPassword({
      db,projectId:schoolAdminProjectId(),userId:user.id,
      currentPassword:data.currentPassword,newPassword:data.newPassword
    });
    return res.status(200).json(result);
  }catch(e){
    if([400,401,403,409].includes(e?.status))
      return secureApiResponse(res,e.status===409?403:e.status);
    console.error("Secure password rotation blocked",e?.code||"unavailable");
    return secureApiResponse(res,503);
  }
}
