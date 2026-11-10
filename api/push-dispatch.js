/**
 * Optional instant dispatch after a real document write.
 * A browser may only point to a candidate event; the server recomputes
 * status, actor and recipients from the current document and school users.
 */
import {fail,forbidCrossSite,setupResponse} from "./_signatureServer.js";
import {
  verifiedPushUser,loadEventDocument,pushSchoolEvent
} from "./_webPushServer.js";
import {serverNotificationEvent} from "../shared/pushEvents.js";
export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="POST")return fail(res,405,"ไม่รองรับคำขอนี้");
  if(!String(req.headers["content-type"]||"")
    .toLowerCase().startsWith("application/json"))
    return fail(res,415,"ข้อมูลต้องเป็น JSON");
  const data=req.body;
  if(!data||typeof data!=="object"||Array.isArray(data)||
     JSON.stringify(data).length>900||
     Object.keys(data).some(k=>!["docId","kind","eventId"].includes(k))||
     typeof data.docId!=="string"||typeof data.kind!=="string"||
     (data.eventId!==undefined&&typeof data.eventId!=="string"))
    return fail(res,400,"ข้อมูลเหตุการณ์ไม่ถูกต้อง");
  try{
    const actor=await verifiedPushUser(req);
    const {doc,users,settings}=await loadEventDocument(data.docId);
    const event=serverNotificationEvent({
      doc,actor,kind:data.kind,eventId:data.eventId||"",
      users,settings
    });
    if(!event)return fail(res,403,"ไม่พบเหตุการณ์ที่มีสิทธิ์แจ้งเตือน");
    const result=await pushSchoolEvent(event,users,doc.type);
    return res.status(200).json(result);
  }catch(error){
    const status=[400,401,403,404,503].includes(error?.status)?error.status:503;
    return fail(res,status,status===503?
      "บริการแจ้งเตือนยังไม่พร้อมใช้งาน":"ไม่สามารถส่งแจ้งเตือนเหตุการณ์นี้ได้");
  }
}