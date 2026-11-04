/**
 * ISOLATED LOCAL EMULATOR ONLY. Never calls the school's deployed GAS.
 * A test-only local HTTP upload receiver simulates secret-gated Google Drive
 * and returns a TEST_DRIVE_... identifier. No real file is published.
 */
import {fail,forbidCrossSite,setupResponse,schoolAdminProjectId}
  from "./_signatureServer.js";
import {
  secureApiPreviewReady,requirePreviewSchoolSession,
  secureApiResponse,enforceJsonSameOrigin
} from "./_schoolSessionGuard.js";
import {addSyntheticIncomingPdf} from "./_securePdfUpload.js";

const LOCAL_TARGET="http://127.0.0.1:8101/upload";
async function localPrivateUpload({base64,fileName,mimeType}){
  if(process.env.BHS_TEST_GAS_UPLOAD_URL!==LOCAL_TARGET||
     typeof process.env.BHS_TEST_GAS_UPLOAD_SECRET!=="string"||
     process.env.BHS_TEST_GAS_UPLOAD_SECRET.length<32)
    throw Object.assign(new Error("local_test_receiver_unavailable"),{status:503});
  const abort=new AbortController();
  const timer=setTimeout(()=>abort.abort(),12000);
  try{
    const response=await fetch(LOCAL_TARGET,{
      method:"POST",signal:abort.signal,
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        action:"secureUpload",
        uploadSecret:process.env.BHS_TEST_GAS_UPLOAD_SECRET,
        base64,fileName,mimeType
      })
    });
    if(!response.ok)throw new Error("local_test_receiver_http");
    return await response.json();
  }finally{clearTimeout(timer);}
}
export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="POST")return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(!secureApiPreviewReady("BHS_ENABLE_SECURE_UPLOAD_PREVIEW"))
    return secureApiResponse(res,503);
  if(!enforceJsonSameOrigin(req))return secureApiResponse(res,403);
  const input=req.body;
  if(!input||typeof input!=="object"||Array.isArray(input)||
     Object.keys(input).some(k=>
       !["docId","uploadId","fileName","base64"].includes(k))||
     JSON.stringify(input).length>4.5*1024*1024)
    return secureApiResponse(res,400);
  try{
    const {user,db}=await requirePreviewSchoolSession(req);
    const result=await addSyntheticIncomingPdf({
      db,projectId:schoolAdminProjectId(),actorId:user.id,
      docId:input.docId,uploadId:input.uploadId,
      fileName:input.fileName,base64:input.base64,
      deliver:localPrivateUpload
    });
    return res.status(200).json(result);
  }catch(e){
    if([400,401,403,409].includes(e?.status))
      return secureApiResponse(res,e.status===409?400:e.status);
    // Do not log file data, the server transport key or GAS response body.
    console.error("Isolated secure PDF upload unavailable",e?.code||"test_endpoint_unavailable");
    return secureApiResponse(res,503);
  }
}
