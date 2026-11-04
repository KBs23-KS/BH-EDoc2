/**
 * Isolated school register API: order/outgoing metadata, not PDF files.
 * All roles and current counters are verified by the server transaction.
 */
import {fail,forbidCrossSite,setupResponse,schoolAdminProjectId}
  from "./_signatureServer.js";
import {
  secureApiPreviewReady,requirePreviewSchoolSession,
  secureApiResponse,enforceJsonSameOrigin
} from "./_schoolSessionGuard.js";
import {manageSyntheticReservation}
  from "./_secureReservations.js";
export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="POST")return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(!secureApiPreviewReady("BHS_ENABLE_SECURE_REGISTER_PREVIEW"))
    return secureApiResponse(res,503);
  if(!enforceJsonSameOrigin(req))return secureApiResponse(res,403);
  const body=req.body;
  if(!body||typeof body!=="object"||Array.isArray(body)||
     JSON.stringify(body).length>7000||
     !["ORDER","OUT"].includes(body.kind)||
     !["create","edit","cancel"].includes(body.action)||
     (body.reservationId!==undefined&&typeof body.reservationId!=="string")||
     (body.form!==undefined&&(!body.form||typeof body.form!=="object"||
       Array.isArray(body.form))))
    return secureApiResponse(res,400);
  try{
    const {user,db}=await requirePreviewSchoolSession(req);
    const result=await manageSyntheticReservation({
      db,projectId:schoolAdminProjectId(),actorId:user.id,kind:body.kind,
      action:body.action,reservationId:body.reservationId,form:body.form||{}
    });
    return res.status(200).json(result);
  }catch(e){
    if([400,401,403,404,409].includes(e?.status))
      return secureApiResponse(res,e.status===409?400:e.status);
    console.error("Secure register command unavailable",e?.code||"unknown");
    return secureApiResponse(res,503);
  }
}
