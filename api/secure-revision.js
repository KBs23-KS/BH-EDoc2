/**
 * ISOLATED LOCAL EMULATOR ONLY — returned PDF staging and resubmission.
 * Requires current school session; actual source files must pass PDF parser.
 * Cannot upload to school Google Drive or mark PDFs signed.
 */
import {fail,forbidCrossSite,setupResponse,schoolAdminProjectId}
  from "./_signatureServer.js";
import {
  secureApiPreviewReady,requirePreviewSchoolSession,
  secureApiResponse,enforceJsonSameOrigin
} from "./_schoolSessionGuard.js";
import {localPrivateUpload} from "./secure-upload.js";
import {
  stageSyntheticRevisionPdf,finalizeSyntheticRevision
} from "./_secureRevisions.js";
export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="POST")return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(!secureApiPreviewReady("BHS_ENABLE_SECURE_REVISION_PREVIEW"))
    return secureApiResponse(res,503);
  if(!enforceJsonSameOrigin(req))return secureApiResponse(res,403);
  const input=req.body;
  if(!input||typeof input!=="object"||Array.isArray(input)||
     JSON.stringify(input).length>4.5*1024*1024||
     !["stage","finalize"].includes(input.action))
    return secureApiResponse(res,400);
  const allowed=input.action==="stage"?
    ["action","docId","uploadId","fileName","base64"]:
    ["action","docId","subject","uploadIds"];
  if(Object.keys(input).some(key=>!allowed.includes(key)))
    return secureApiResponse(res,400);
  try{
    const {user,db}=await requirePreviewSchoolSession(req);
    const args={db,projectId:schoolAdminProjectId(),actorId:user.id,
      docId:input.docId};
    const output=input.action==="stage"?
      await stageSyntheticRevisionPdf({
        ...args,uploadId:input.uploadId,fileName:input.fileName,
        base64:input.base64,deliver:localPrivateUpload
      }):
      await finalizeSyntheticRevision({
        ...args,subject:input.subject,uploadIds:input.uploadIds
      });
    return res.status(200).json(output);
  }catch(e){
    if([400,401,403,404,409].includes(e?.status))
      return secureApiResponse(res,e.status===409?400:e.status);
    console.error("Secure revision test rejected",e?.code||"unavailable");
    return secureApiResponse(res,503);
  }
}
