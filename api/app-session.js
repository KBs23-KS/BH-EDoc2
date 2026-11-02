import {
  fail,appSessionReady,forbidCrossSite,findByUsername,matchesLegacyPassword,
  makeAppSession,readAppSession,setAppSessionCookie,clearAppSessionCookie,
  userRef,setupResponse
} from "./_signatureServer.js";

/**
 * Re-establish a valid logged-in profile after page refresh.
 * This cookie never authorizes PDF signing; signing requires its own 30-minute cookie.
 */
export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method==="DELETE"){
    clearAppSessionCookie(res);
    return res.status(200).json({success:true});
  }
  if(!["GET","POST"].includes(req.method))return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(!appSessionReady())return fail(res,503,"บริการจดจำการเข้าสู่ระบบยังไม่พร้อมใช้งาน");
  try{
    if(req.method==="GET"){
      const id=readAppSession(req);
      if(!id)return fail(res,401,"ไม่มีเซสชันการเข้าสู่ระบบ");
      const userDoc=await userRef(id).get();
      if(!userDoc.exists||userDoc.data()?.status==="inactive"){
        clearAppSessionCookie(res);
        return fail(res,401,"บัญชีไม่พร้อมใช้งาน กรุณาเข้าสู่ระบบอีกครั้ง");
      }
      return res.status(200).json({success:true,userId:id});
    }
    const {username,password,remember=false}=req.body||{};
    if(typeof username!=="string"||username.length<1||username.length>120||
       typeof password!=="string"||password.length>128||typeof remember!=="boolean")
      return fail(res,400,"ข้อมูลเข้าสู่ระบบไม่ถูกต้อง");
    const user=await findByUsername(username.trim());
    if(!user||user.status==="inactive"||!matchesLegacyPassword(password,user))
      return fail(res,401,"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    setAppSessionCookie(res,makeAppSession(user.id,remember),remember);
    return res.status(200).json({success:true,userId:user.id});
  }catch(err){
    console.error("App session error:",err?.message);
    return fail(res,503,"บริการตรวจสอบการเข้าสู่ระบบยังไม่พร้อมใช้งาน");
  }
}
