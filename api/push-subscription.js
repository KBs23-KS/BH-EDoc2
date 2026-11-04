/**
 * GET the PUBLIC VAPID key, POST/DELETE a device for the current school user.
 * Never accepts userId/role from the browser and never returns push secrets.
 */
import {fail,forbidCrossSite,setupResponse}
  from "./_signatureServer.js";
import {
  pushPublicKey,verifiedPushUser,savePushDevice,removePushDevice
} from "./_webPushServer.js";
export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(!["GET","POST","DELETE"].includes(req.method))
    return fail(res,405,"ไม่รองรับคำขอนี้");
  if(req.method!=="GET"&&!String(req.headers["content-type"]||"")
    .toLowerCase().startsWith("application/json"))
    return fail(res,415,"ข้อมูลต้องเป็น JSON");
  try{
    const user=await verifiedPushUser(req);
    if(req.method==="GET")return res.status(200).json({
      success:true,publicKey:pushPublicKey()
    });
    const data=req.body;
    if(!data||typeof data!=="object"||Array.isArray(data)||
       JSON.stringify(data).length>4000||
       Object.keys(data).some(k=>!["subscription","endpoint"].includes(k)))
      return fail(res,400,"ข้อมูลอุปกรณ์ไม่ถูกต้อง");
    const result=req.method==="POST"?
      await savePushDevice(user.id,data.subscription):
      await removePushDevice(user.id,data.endpoint);
    return res.status(200).json(result);
  }catch(error){
    const status=[400,401,403,503].includes(error?.status)?error.status:503;
    // Never log token, endpoint, full request body or school password.
    return fail(res,status,status===401?
      "กรุณาเข้าสู่ระบบใหม่เพื่อเปิดแจ้งเตือน":
      status===503?"ระบบแจ้งเตือนยังไม่ได้เปิดใช้งานบนเซิร์ฟเวอร์":
      "ไม่สามารถลงทะเบียนอุปกรณ์ได้");
  }
}