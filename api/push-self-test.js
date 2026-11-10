/**
 * A signed-in school user can verify their OWN registered Web Push devices.
 * No document write, arbitrary recipient, or client-supplied badge count.
 */
import {fail,forbidCrossSite,setupResponse} from "./_signatureServer.js";
import {verifiedPushUser,pushSelfTest} from "./_webPushServer.js";
export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="POST")return fail(res,405,"ไม่รองรับคำขอนี้");
  if(req.body&&typeof req.body==="object"&&Object.keys(req.body).length)
    return fail(res,400,"ไม่รับข้อมูลผู้รับจากผู้ใช้");
  try{
    const user=await verifiedPushUser(req);
    return res.status(200).json(await pushSelfTest(user));
  }catch(err){
    const status=[400,401,403,429,503].includes(err?.status)?err.status:503;
    return fail(res,status,status===401?"กรุณาเข้าสู่ระบบใหม่":
      status===429?"ส่งทดสอบได้อีกครั้งหลังผ่าน 60 วินาที (ไม่เกิน 12 ครั้งต่อวัน)":
      "ยังไม่สามารถส่งแจ้งเตือนทดสอบได้");
  }
}
