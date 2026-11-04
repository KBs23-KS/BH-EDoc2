/** Isolated test-only BHS admin number/settings API (no real Firebase writes). */
import {fail,forbidCrossSite,setupResponse,schoolAdminProjectId}
  from "./_signatureServer.js";
import {
  secureApiPreviewReady,requirePreviewSchoolSession,
  secureApiResponse,enforceJsonSameOrigin
} from "./_schoolSessionGuard.js";
import {
  readSyntheticRegisterOverview,setSyntheticNextRegister,
  saveSyntheticSchoolSettings
} from "./_secureAdminOperations.js";
export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(!["GET","POST"].includes(req.method))
    return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(!secureApiPreviewReady("BHS_ENABLE_SECURE_ADMIN_PREVIEW"))
    return secureApiResponse(res,503);
  if(req.method==="POST"&&!enforceJsonSameOrigin(req))
    return secureApiResponse(res,403);
  try{
    const {user,db}=await requirePreviewSchoolSession(req);
    if(user.role!=="admin")return secureApiResponse(res,403);
    const common={db,projectId:schoolAdminProjectId(),actorId:user.id};
    if(req.method==="GET"){
      const {kind,year}=req.query||{};
      if(!["ORDER","OUT"].includes(kind)||!/^\d{4}$/.test(String(year||"")))
        return secureApiResponse(res,400);
      const data=await readSyntheticRegisterOverview({...common,kind,year:Number(year)});
      return res.status(200).json(data);
    }
    const body=req.body;
    if(!body||typeof body!=="object"||Array.isArray(body)||
       JSON.stringify(body).length>12000)
      return secureApiResponse(res,400);
    if(body.action==="set-next"){
      if(Object.keys(body).some(k=>
           !["action","kind","year","nextNumber"].includes(k)))
        return secureApiResponse(res,400);
      const data=await setSyntheticNextRegister({
        ...common,kind:body.kind,year:body.year,nextNumber:body.nextNumber
      });
      return res.status(200).json(data);
    }
    if(body.action==="save-settings"){
      if(Object.keys(body).some(k=>!["action","settings"].includes(k)))
        return secureApiResponse(res,400);
      const data=await saveSyntheticSchoolSettings({...common,settings:body.settings});
      return res.status(200).json(data);
    }
    return secureApiResponse(res,400);
  }catch(e){
    if([400,401,403,404,409].includes(e?.status))
      return secureApiResponse(res,e.status===409?400:e.status);
    console.error("Isolated school admin operation blocked",e?.code||"unavailable");
    return secureApiResponse(res,503);
  }
}
