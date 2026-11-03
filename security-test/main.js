import {initializeApp} from "firebase/app";
import {getAuth,signInWithCustomToken,signOut,onAuthStateChanged} from "firebase/auth";
import {getFirestore,doc,getDoc} from "firebase/firestore";
import {verifyTestProject} from "./firebaseConfig.js";

const byId=id=>document.getElementById(id);
const projectLabel=byId("project"),setup=byId("setup"),probe=byId("probe");
const result=byId("result"),form=byId("login-form"),login=byId("login");
const session=byId("session"),logout=byId("logout"),readSample=byId("read-sample");
const accessResult=byId("access-result");

try{
  // Verify BEFORE initializeApp; NEVER fall back to bhs-edoc-2.
  const config=verifyTestProject();
  const app=initializeApp(config,"bhs-edoc-security-test");
  if(app.options.projectId!=="bhs-edoc-security-test")throw new Error("Wrong project");
  const db=getFirestore(app),auth=getAuth(app);
  projectLabel.textContent=app.options.projectId;
  setup.textContent="เชื่อม Firebase ทดสอบในฝั่งเว็บไซต์แล้ว (ไม่ได้หมายความว่า API พร้อม)";
  probe.disabled=false;
  login.disabled=false;

  probe.addEventListener("click",async()=>{
    if(auth.currentUser){
      result.textContent="กรุณาออกจากระบบจำลองก่อนทดสอบสถานะไม่เข้าสู่ระบบ";
      return;
    }
    probe.disabled=true;
    try{
      await getDoc(doc(db,"bhs_security_test_documents","TEST_SHARED_001"));
      result.textContent="⚠️ ไม่ผ่าน: อ่านข้อมูลได้โดยไม่มีการยืนยันตัวตน";
    }catch(error){
      result.textContent=error.code==="permission-denied"?
        "✅ ผ่าน: Firestore ปฏิเสธผู้ไม่เข้าสู่ระบบ":
        "ยังสรุปไม่ได้: "+(error.code||"connection-error");
    }finally{probe.disabled=false;}
  });

  form.addEventListener("submit",async e=>{
    e.preventDefault();
    login.disabled=true;
    session.textContent="กำลังตรวจบัญชีจำลอง...";
    try{
      const username=byId("username").value.trim();
      const password=byId("password").value;
      const response=await fetch("/api/security-test-login",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({username,password})
      });
      byId("password").value="";
      if(!response.ok)throw new Error("LOGIN_FAILED_"+response.status);
      const payload=await response.json();
      if(!payload.customToken||!String(payload.uid||"").startsWith("TEST_"))
        throw new Error("INVALID_TEST_TOKEN");
      const signed=await signInWithCustomToken(auth,payload.customToken);
      if(signed.user.uid!==payload.uid)throw new Error("INVALID_TEST_IDENTITY");
      session.textContent="เข้าสู่ระบบทดสอบ: "+payload.profile.name+" ("+payload.profile.role+")";
    }catch(error){
      byId("password").value="";
      session.textContent="ยังเข้าสู่ระบบไม่ได้: "+(error.message.startsWith("LOGIN_FAILED_")?
        "API ยังไม่พร้อมหรือชื่อผู้ใช้/รหัสผ่านไม่ถูกต้อง": "ตรวจการตั้งค่าทดสอบ");
    }finally{login.disabled=false;}
  });
  onAuthStateChanged(auth,user=>{
    const loggedIn=Boolean(user&&user.uid.startsWith("TEST_"));
    logout.hidden=!loggedIn;
    readSample.hidden=!loggedIn;
    if(!loggedIn)session.textContent="ยังไม่เข้าสู่ระบบ";
    if(user&&!loggedIn)signOut(auth);
  });
  logout.addEventListener("click",async()=>{
    await signOut(auth);
    accessResult.textContent="ออกจากระบบแล้ว";
  });
  readSample.addEventListener("click",async()=>{
    if(!auth.currentUser||!auth.currentUser.uid.startsWith("TEST_"))return;
    const items=["TEST_SHARED_001","TEST_PRIVATE_001","TEST_DIRECTOR_PENDING"];
    const checks=[];
    for(const id of items){
      try{
        const snap=await getDoc(doc(db,"bhs_security_test_documents",id));
        checks.push(id+": "+(snap.exists()?"อ่านได้":"ไม่พบข้อมูลจำลอง"));
      }catch(err){
        checks.push(id+": "+(err.code==="permission-denied"?"ปฏิเสธตามสิทธิ์":"ตรวจสอบไม่ได้ ("+(err.code||"error")+")"));
      }
    }
    accessResult.textContent=checks.join("\n");
  });
}catch(error){
  projectLabel.textContent="BLOCKED";
  setup.textContent="หยุดการเชื่อมต่อ: "+error.message;
  login.disabled=true;
  probe.disabled=true;
}
