import {fail,ready,forbidCrossSite,readSession,userRef,documentRef,allowedToSign,setupResponse} from "./_signatureServer.js";

const MAX_SOURCE_PDF=4*1024*1024; // Vercel function response limits; larger files use safe fallback
export default async function handler(req,res){
  setupResponse(res);
  if(req.method!=="POST")return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(forbidCrossSite(req,res))return;
  if(!ready())return fail(res,503,"ยังไม่ได้ตั้งค่าบริการเปิด PDF อัตโนมัติที่ Vercel");
  const userId=readSession(req);
  if(!userId)return fail(res,401,"เซสชันลงนามหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  const {docId,driveId}=req.body||{};
  if(typeof docId!=="string"||!/^[-a-zA-Z0-9_]{4,150}$/.test(docId)||
    typeof driveId!=="string"||!/^[-a-zA-Z0-9_]{8,160}$/.test(driveId))
    return fail(res,400,"รหัสเอกสารไม่ถูกต้อง");
  try {
    const [u,d]=await Promise.all([userRef(userId).get(),documentRef(docId).get()]);
    const user=u.exists?{id:u.id,...u.data()}:null,doc=d.exists?d.data():null;
    if(!allowedToSign(user,doc,driveId))return fail(res,403,"ไม่มีสิทธิ์อ่าน PDF นี้เพื่อลงนาม");
    const gasUrl=process.env.BHS_GAS_WEB_APP_URL;
    if(!gasUrl||!gasUrl.startsWith("https://script.google.com/macros/s/"))return fail(res,503,"ยังไม่ได้ตั้งค่า GAS สำหรับการลงนาม");
    const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),20000);
    let payload;
    try {
      const response=await fetch(gasUrl,{method:"POST",body:JSON.stringify({action:"getFile",fileId:driveId,backupSecret:process.env.BHS_BACKUP_SECRET}),signal:abort.signal});
      if(!response.ok)return fail(res,502,"บริการ Google Drive ยังไม่พร้อม");
      payload=await response.json();
    }finally{clearTimeout(timeout);}
    if(!payload?.success||!payload?.base64)return fail(res,502,"เปิดไฟล์ต้นฉบับไม่ได้: "+String(payload?.error||"ไม่พบเนื้อหา").slice(0,160));
    if(payload.base64.length>Math.ceil(MAX_SOURCE_PDF/3)*4+4)return fail(res,413,"PDF ใหญ่เกินขนาดที่เปิดอัตโนมัติได้ ให้ใช้ไฟล์ต้นฉบับจาก Drive แทน");
    const bytes=Buffer.from(payload.base64,"base64");
    if(!bytes.length||bytes.length>MAX_SOURCE_PDF||!bytes.subarray(0,1024).includes(Buffer.from("%PDF-")))
      return fail(res,422,"ไฟล์ที่ได้รับไม่ใช่ PDF ที่ถูกต้องหรือมีขนาดเกินกำหนด");
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Length",String(bytes.length));
    return res.status(200).end(bytes);
  } catch(err) {
    console.error("Signing read error",err?.message);
    return fail(res,502,"เปิด PDF จาก Drive อัตโนมัติไม่สำเร็จ");
  }
}
