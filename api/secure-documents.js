/**
 * Secure BHS incoming document metadata API — local emulator only.
 * This intentionally rejects PDF/Drive uploads and signed-file spoofing.
 */
import {fail,forbidCrossSite,setupResponse,schoolAdminProjectId}
  from "./_signatureServer.js";
import {
  secureApiPreviewReady,requirePreviewSchoolSession,
  secureApiResponse,enforceJsonSameOrigin
} from "./_schoolSessionGuard.js";
import {manageSyntheticIncomingDocument}
  from "./_secureIncomingDocuments.js";

export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="POST")return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(!secureApiPreviewReady("BHS_ENABLE_SECURE_DOCUMENTS_PREVIEW"))
    return secureApiResponse(res,503);
  if(!enforceJsonSameOrigin(req))return secureApiResponse(res,403);
  const body=req.body;
  if(!body||typeof body!=="object"||Array.isArray(body)||
     JSON.stringify(body).length>8000||
     !["create","edit","soft-delete"].includes(body.action)||
     (body.docId!==undefined&&typeof body.docId!=="string")||
     (body.form!==undefined&&(!body.form||typeof body.form!=="object"||
       Array.isArray(body.form))))
    return secureApiResponse(res,400);
  try{
    const {user,db}=await requirePreviewSchoolSession(req);
    const result=await manageSyntheticIncomingDocument({
      db,projectId:schoolAdminProjectId(),actorId:user.id,
      action:body.action,docId:body.docId,form:body.form||{}
    });
    return res.status(200).json(result);
  }catch(e){
    if([400,401,403,404,409].includes(e?.status))
      return secureApiResponse(res,e.status===409?400:e.status);
    console.error("Secure incoming document command refused",e?.code||"unavailable");
    return secureApiResponse(res,503);
  }
}
