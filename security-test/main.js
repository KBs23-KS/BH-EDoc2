import {initializeApp} from "firebase/app";
import {getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged} from "firebase/auth";
import {getFirestore,doc,getDoc} from "firebase/firestore";
import {verifyTestProject} from "./firebaseConfig.js";
import {syntheticUser,syntheticEmail} from "./syntheticUsers.js";

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
      const user=syntheticUser(username);
      if(!user)throw new Error("UNKNOWN_SYNTHETIC_USER");
      // Firebase Authentication handles password hashing and verification.
      // Only synthetic demo accounts with a privileged custom claim may read test documents.
      const credential=await signInWithEmailAndPassword(auth,syntheticEmail(username),password);
      if(credential.user.uid!==user.uid)throw new Error("INVALID_SYNTHETIC_UID");
      await credential.user.getIdToken(true);
      const token=await credential.user.getIdTokenResult();
      if(token.claims.bhsSecurityTest!==true)throw new Error("TEST_CLAIM_MISSING");
      const profile=await getDoc(doc(db,"bhs_security_test_profiles",user.uid));
      if(!profile.exists()||profile.data().status!=="active"||
        profile.data().role!==user.role)throw new Error("TEST_PROFILE_NOT_ALLOWED");
      session.textContent="เข้าสู่ระบบทดสอบ: "+profile.data().name+" ("+profile.data().role+")";
    }catch(error){
      // A failed claim or profile check must not retain an unauthorized Firebase session.
      if(auth.currentUser)await signOut(auth);
      session.textContent="ยังเข้าสู่ระบบไม่ได้: "+
        (error.message==="UNKNOWN_SYNTHETIC_USER"?"ใช้เฉพาะชื่อผู้ใช้บัญชีจำลอง":
         error.code==="auth/operation-not-allowed"?"กรุณาเปิด Email/Password ใน Firebase ทดสอบก่อน":
         error.code==="permission-denied"?"Firestore Rules ทดลองยังไม่พร้อม":
         "ตรวจรหัสผ่านบัญชีจำลองและการตั้งค่า Firebase ทดลอง");
    }finally{byId("password").value="";login.disabled=false;}
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
