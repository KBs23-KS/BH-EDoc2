/**
 * Isolated emulator-only admin account operations for the REAL BHS schema.
 * No credentials, hashes, private version tags or login cookies are returned.
 */
import {fail,forbidCrossSite,setupResponse,schoolAdminProjectId}
  from "./_signatureServer.js";
import {
  secureApiPreviewReady,requirePreviewSchoolSession,
  secureApiResponse,enforceJsonSameOrigin
} from "./_schoolSessionGuard.js";
import {manageSyntheticSchoolAccount}
  from "./_secureAccountManagement.js";

export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="POST")return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(!secureApiPreviewReady("BHS_ENABLE_SECURE_USERS_PREVIEW"))
    return secureApiResponse(res,503);
  if(!enforceJsonSameOrigin(req))return secureApiResponse(res,403);
  const input=req.body;
  if(!input||typeof input!=="object"||Array.isArray(input)||
     JSON.stringify(input).length>5000||
     !["create","edit","status","delete"].includes(input.action)||
     (input.targetId!==undefined&&typeof input.targetId!=="string")||
     (input.form!==undefined&&(!input.form||typeof input.form!=="object"||
      Array.isArray(input.form))))
    return secureApiResponse(res,400);
  try{
    const {user,db}=await requirePreviewSchoolSession(req);
    if(user.role!=="admin")return secureApiResponse(res,403);
    const result=await manageSyntheticSchoolAccount({
      db,projectId:schoolAdminProjectId(),actorId:user.id,
      action:input.action,targetId:input.targetId,form:input.form||{}
    });
    return res.status(200).json(result);
  }catch(e){
    if([400,401,403,404,409].includes(e?.status))
      return secureApiResponse(res,e.status===409?400:e.status);
    // Never print an incoming password, account form or credential hash.
    console.error("Isolated account-management request rejected",e?.code||"unavailable");
    return secureApiResponse(res,503);
  }
}
