/**
 * Logged-in device ownership check and safe same-account Web Push self-test.
 * Accepts only an endpoint and an action. Never returns subscriptions, tokens,
 * recipient lists, school documents, passwords or service credentials.
 */
import {fail,forbidCrossSite,setupResponse} from "./_signatureServer.js";
import {verifiedPushUser,checkOwnedPushDevice,selfTestOwnedPushDevice}
  from "./_webPushServer.js";
export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="POST")return fail(res,405,"ไม่รองรับคำขอนี้");
  if(!String(req.headers["content-type"]||"")
    .toLowerCase().startsWith("application/json"))
    return fail(res,415,"ข้อมูลต้องเป็น JSON");
  const data=req.body;
  if(!data||typeof data!=="object"||Array.isArray(data)||
     JSON.stringify(data).length>2400||
     Object.keys(data).some(k=>!["action","endpoint"].includes(k))||
     !["status","test"].includes(data.action)||typeof data.endpoint!=="string")
    return fail(res,400,"ข้อมูลคำขอไม่ถูกต้อง");
  try{
    const user=await verifiedPushUser(req);
    const result=data.action==="status"?
      await checkOwnedPushDevice(user,data.endpoint):
      await selfTestOwnedPushDevice(user,data.endpoint);
    return res.status(200).json(result);
  }catch(err){
    const status=[400,401,403,429,503].includes(err?.status)?err.status:503;
    return fail(res,status,status===401?
      "กรุณาเข้าสู่ระบบใหม่":status===403?
      "อุปกรณ์นี้ยังไม่ได้ผูกกับบัญชีที่เข้าสู่ระบบ":status===429?
      "ส่งทดสอบบ่อยเกินไป กรุณาลองภายหลัง":status===400?
      "ข้อมูลอุปกรณ์ไม่ถูกต้อง":"ระบบทดสอบแจ้งเตือนยังไม่พร้อม");
  }
}
