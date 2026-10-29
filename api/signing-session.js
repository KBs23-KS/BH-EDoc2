import {fail,ready,forbidCrossSite,findByUsername,makeSession,setSessionCookie,clearSessionCookie,matchesLegacyPassword,setupResponse} from "./_signatureServer.js";

export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method==="DELETE"){clearSessionCookie(res);return res.status(200).json({success:true});}
  if(req.method!=="POST")return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(!ready())return fail(res,503,"ยังไม่ได้ตั้งค่าบริการเปิด PDF อัตโนมัติที่ Vercel");
  const {username,password}=req.body||{};
  if(typeof username!=="string"||typeof password!=="string"||username.length>120||username.length<1||password.length>128)
    return fail(res,400,"ข้อมูลเข้าสู่ระบบไม่ถูกต้อง");
  try{
    const user=await findByUsername(username.trim());
    if(!user||!matchesLegacyPassword(password,user)||!["director","admin"].includes(user.role)||user.status==="inactive")
      return fail(res,401,"ไม่มีสิทธิ์ลงนามหรือชื่อผู้ใช้/รหัสผ่านไม่ถูกต้อง");
    setSessionCookie(res,makeSession(user.id));
    return res.status(200).json({success:true});
  }catch(err){
    console.error("Signing-session error",err?.message);
    return fail(res,503,"บริการยืนยันสิทธิ์ลงนามไม่พร้อมใช้งาน");
  }
}
