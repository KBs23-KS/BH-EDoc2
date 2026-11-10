/**
 * Per-user, server-verified badge for the installed PWA.
 * GET returns this account's pending count across all bell categories.
 * POST updates this account's other devices after a verified recent acknowledgement.
 */
import {fail,forbidCrossSite,setupResponse} from "./_signatureServer.js";
import {verifiedPushUser,currentNotificationBadge,pushAcknowledgementBadge}
  from "./_webPushServer.js";

export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(!["GET","POST"].includes(req.method))
    return fail(res,405,"ไม่รองรับคำขอนี้");
  if(req.method==="POST"&&
     !String(req.headers["content-type"]||"").toLowerCase().startsWith("application/json"))
    return fail(res,415,"ข้อมูลต้องเป็น JSON");
  try{
    const user=await verifiedPushUser(req);
    if(req.method==="GET")
      return res.status(200).json({success:true,
        badgeCount:await currentNotificationBadge(user)});
    const data=req.body;
    if(!data||typeof data!=="object"||Array.isArray(data)||
       JSON.stringify(data).length>350||
       Object.keys(data).some(k=>!["docId","kind","eventId"].includes(k))||
       typeof data.docId!=="string"||
       (data.kind!==undefined&&!["receipt","assignment"].includes(data.kind))||
       (data.eventId!==undefined&&typeof data.eventId!=="string"))
      return fail(res,400,"ข้อมูลคำขอไม่ถูกต้อง");
    const result=await pushAcknowledgementBadge(user,data.docId,data.kind||"receipt",data.eventId||"");
    return res.status(200).json(result);
  }catch(err){
    const code=[400,401,403,503].includes(err?.status)?err.status:503;
    return fail(res,code,code===401?"กรุณาเข้าสู่ระบบใหม่":
      code===403?"ไม่มีสิทธิ์อัปเดตสถานะหนังสือนี้":
      code===400?"ข้อมูลคำขอไม่ถูกต้อง":"ระบบตัวเลขแจ้งเตือนยังไม่พร้อม");
  }
}
