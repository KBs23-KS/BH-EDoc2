import {initializeApp} from "firebase/app";
import {getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged} from "firebase/auth";
import {getFirestore,doc,collection,getDoc,setDoc,updateDoc,serverTimestamp} from "firebase/firestore";
import {verifyTestProject} from "./firebaseConfig.js";
import {SYNTHETIC_USERS,syntheticUser,syntheticEmail} from "./syntheticUsers.js";

const $=id=>document.getElementById(id);
const projectLabel=$("project"),setup=$("setup"),probe=$("probe"),probeResult=$("result");
const form=$("login-form"),login=$("login"),session=$("session");
const logout=$("logout"),readSample=$("read-sample"),accessResult=$("access-result");
const workflow=$("workflow"),flowTitle=$("flow-title"),flowId=$("flow-id");
const flowStatus=$("flow-status"),flowCreate=$("flow-create"),flowSend=$("flow-send");
const flowApprove=$("flow-approve"),flowAcknowledge=$("flow-ack"),flowRefresh=$("flow-refresh");
const flowCopy=$("flow-copy"),flowResult=$("flow-result");
const TEST_PROJECT_ID="bhs-edoc-security-test";
const FLOW_PREFIX="TEST_FLOW_";
const FLOW_ID_PATTERN=/^TEST_FLOW_[a-zA-Z0-9]{20}$/;
const FLOW_STORAGE_KEY="bhs-edoc-security-test:current-flow-id";
const FLOW_COLLECTION="bhs_security_test_documents";
const USER_UIDS=Object.freeze({clerk:"TEST_CLERK_001",teacher:"TEST_TEACHER_001"});
const statusLabel=Object.freeze({
  draft:"ฉบับร่าง (ธุรการ)",
  "pending-director":"รอผู้อำนวยการอนุมัติ",
  approved:"อนุมัติแล้ว — รอครูรับทราบ"
});

try {
  // A project mismatch must block the whole site before initializing Firebase.
  const app=initializeApp(verifyTestProject(),TEST_PROJECT_ID);
  if(app.options.projectId!==TEST_PROJECT_ID)throw new Error("Wrong Firebase test project");
  const auth=getAuth(app),db=getFirestore(app);
  projectLabel.textContent=TEST_PROJECT_ID;
  setup.textContent="เชื่อมต่อ Firebase โครงการทดสอบ (ใช้ข้อมูลจำลองเท่านั้น)";
  probe.disabled=false;login.disabled=false;

  try {
    const previouslyUsed=localStorage.getItem(FLOW_STORAGE_KEY);
    if(previouslyUsed && FLOW_ID_PATTERN.test(previouslyUsed))flowId.value=previouslyUsed;
  } catch {/* Local storage may be unavailable; the document ID remains editable. */}

  function feedback(message){flowResult.textContent=message;}
  function rememberFlowId(id){
    flowId.value=id;
    try {localStorage.setItem(FLOW_STORAGE_KEY,id);} catch {/* Optional convenience only. */}
  }
  function documentReference(){
    const id=flowId.value.trim();
    if(!FLOW_ID_PATTERN.test(id))throw new Error("กรุณาใส่รหัสเอกสารจำลอง TEST_FLOW_... ให้ถูกต้อง");
    rememberFlowId(id);
    return doc(db,FLOW_COLLECTION,id);
  }
  function displayRole(identity){
    const loggedIn=Boolean(identity);
    logout.hidden=!loggedIn;
    readSample.hidden=!loggedIn;
    workflow.hidden=!loggedIn;
    flowCreate.hidden=identity?.role!=="clerk";
    flowSend.hidden=identity?.role!=="admin";
    flowApprove.hidden=identity?.role!=="director";
    flowAcknowledge.hidden=identity?.uid!==USER_UIDS.teacher;
    if(!loggedIn){
      flowStatus.textContent="ยังไม่เข้าสู่ระบบจำลอง";
      feedback("ล็อกอินด้วยบัญชีจำลองก่อนดำเนินการ");
      accessResult.textContent="ทดสอบการอ่านหลังเข้าสู่ระบบได้เมื่อพร้อม";
    }
  }
  // Each write validates identity and custom claims again; UI visibility is never authorization.
  async function verifyRole(role,user=auth.currentUser){
    const expected=SYNTHETIC_USERS.find(person=>person.uid===user?.uid);
    if(!user||!expected||expected.role!==role||
       user.email?.toLowerCase()!==syntheticEmail(expected.username))
      throw new Error("บัญชีจำลองไม่ตรงกับบทบาท");
    const token=await user.getIdTokenResult(true);
    if(token.claims.bhsSecurityTest!==true)throw new Error("ไม่มีสิทธิ์บัญชีทดสอบ");
    const profile=await getDoc(doc(db,"bhs_security_test_profiles",user.uid));
    if(!profile.exists()||profile.data().status!=="active"||
       profile.data().role!==role)throw new Error("โปรไฟล์บัญชีจำลองไม่พร้อม");
    return {identity:expected,profile:profile.data()};
  }
  async function work(button,action){
    button.disabled=true;
    feedback("กำลังตรวจสิทธิ์และดำเนินการกับข้อมูลจำลอง...");
    try {await action();}
    catch(error){
      feedback(error.code==="permission-denied"
        ?"Firestore ปฏิเสธคำสั่งตามสิทธิ์ (หากเป็นบัญชีที่ควรทำได้ ให้ตรวจ Rules ของโครงการทดสอบ)"
        :error.code==="unavailable"
        ?"เชื่อม Firebase ทดสอบไม่ได้ กรุณาลองใหม่"
        :"ไม่สำเร็จ: "+(error.message||"ตรวจสอบการตั้งค่าบัญชีจำลอง"));
    }finally {button.disabled=false;}
  }

  probe.addEventListener("click",async()=>{
    if(auth.currentUser){
      probeResult.textContent="กรุณาออกจากระบบจำลองก่อนทดสอบผู้ไม่เข้าสู่ระบบ";return;
    }
    probe.disabled=true;
    try{
      await getDoc(doc(db,FLOW_COLLECTION,"TEST_SHARED_001"));
      probeResult.textContent="⚠️ ไม่ผ่าน: อ่านข้อมูลได้โดยไม่มีการยืนยันตัวตน";
    }catch(error){
      probeResult.textContent=error.code==="permission-denied"
        ?"✅ ผ่าน: Firestore ปฏิเสธผู้ไม่เข้าสู่ระบบ"
        :"ยังสรุปไม่ได้: "+(error.code||"connection-error");
    }finally{probe.disabled=false;}
  });

  form.addEventListener("submit",async event=>{
    event.preventDefault();login.disabled=true;
    session.textContent="กำลังตรวจบัญชีจำลอง...";
    try{
      const username=$("username").value.trim(),password=$("password").value;
      const identity=syntheticUser(username);
      if(!identity)throw new Error("ชื่อผู้ใช้ต้องเป็นบัญชีจำลองที่กำหนดไว้");
      const result=await signInWithEmailAndPassword(auth,syntheticEmail(username),password);
      if(result.user.uid!==identity.uid)throw new Error("Firebase UID ไม่ตรงกับบัญชีจำลอง");
      const verified=await verifyRole(identity.role,result.user);
      displayRole(identity);
      session.textContent="เข้าสู่ระบบทดสอบ: "+verified.profile.name+" ("+identity.role+")";
    }catch(error){
      if(auth.currentUser)await signOut(auth);
      session.textContent="ยังเข้าสู่ระบบไม่ได้: "+
        (error.code==="auth/operation-not-allowed"
         ?"กรุณาเปิด Email/Password ใน Firebase ทดลองก่อน"
         :error.code==="permission-denied"
         ?"Firestore Rules ทดลองยังไม่พร้อม"
         :"ตรวจรหัสผ่านและสิทธิ์ของบัญชีจำลอง");
    }finally{$("password").value="";login.disabled=false;}
  });

  onAuthStateChanged(auth,async user=>{
    if(!user){displayRole(null);session.textContent="ยังไม่เข้าสู่ระบบ";return;}
    const identity=SYNTHETIC_USERS.find(person=>person.uid===user.uid);
    if(!identity){await signOut(auth);return;}
    try{
      const checked=await verifyRole(identity.role,user);
      if(auth.currentUser?.uid!==user.uid)return;
      displayRole(identity);
      session.textContent="เข้าสู่ระบบทดสอบ: "+checked.profile.name+" ("+identity.role+")";
    }catch{
      if(auth.currentUser?.uid===user.uid)await signOut(auth);
    }
  });

  logout.addEventListener("click",async()=>{
    await signOut(auth);
    feedback("ออกจากระบบจำลองแล้ว");
  });
  readSample.addEventListener("click",async()=>{
    const identity=SYNTHETIC_USERS.find(person=>person.uid===auth.currentUser?.uid);
    if(!identity)return;
    readSample.disabled=true;
    try{
      await verifyRole(identity.role);
      const ids=["TEST_SHARED_001","TEST_PRIVATE_001","TEST_DIRECTOR_PENDING"];
      const outcomes=[];
      for(const id of ids){
        try{
          const snap=await getDoc(doc(db,FLOW_COLLECTION,id));
          outcomes.push(id+": "+(snap.exists()?"อ่านได้":"ไม่พบข้อมูลจำลอง"));
        }catch(error){
          outcomes.push(id+": "+(error.code==="permission-denied"
            ?"ปฏิเสธตามสิทธิ์":"ตรวจสอบไม่ได้ ("+(error.code||"error")+")"));
        }
      }
      accessResult.textContent=outcomes.join("\n");
    }catch{
      accessResult.textContent="บัญชีจำลองไม่มีสิทธิ์หรือยังไม่พร้อม";
    }finally{readSample.disabled=false;}
  });

  flowCreate.addEventListener("click",()=>work(flowCreate,async()=>{
    await verifyRole("clerk");
    const title=flowTitle.value.trim();
    if(!title||title.length>240)throw new Error("กรอกหัวข้อเอกสารจำลองไม่เกิน 240 ตัวอักษร");
    const id=FLOW_PREFIX+doc(collection(db,FLOW_COLLECTION)).id;
    await setDoc(doc(db,FLOW_COLLECTION,id),{
      title,status:"draft",createdBy:USER_UIDS.clerk,
      readerUids:[USER_UIDS.clerk],createdAt:serverTimestamp()
    });
    rememberFlowId(id);
    flowStatus.textContent="ฉบับร่าง — "+id;
    feedback("✅ ธุรการสร้างหนังสือจำลองสำเร็จ\nรหัสเอกสาร: "+id+
      "\nขั้นต่อไป: กดออกจากระบบ แล้วเข้า test_admin เพื่อส่งรอ ผอ. อนุมัติ");
  }));

  flowSend.addEventListener("click",()=>work(flowSend,async()=>{
    await verifyRole("admin");
    const target=documentReference(),snap=await getDoc(target);
    if(!snap.exists())throw new Error("ไม่พบหนังสือจำลองนี้");
    if(snap.data().status!=="draft"||snap.data().createdBy!==USER_UIDS.clerk)
      throw new Error("ส่งได้เฉพาะฉบับร่างที่ธุรการจำลองสร้าง");
    await updateDoc(target,{
      status:"pending-director",
      // Only the demo clerk and teacher are recipients. The rules prevent
      // teacher access until the director approves.
      readerUids:[USER_UIDS.clerk,USER_UIDS.teacher]
    });
    flowStatus.textContent=statusLabel["pending-director"];
    feedback("✅ แอดมินส่งรอ ผอ. อนุมัติแล้ว\nครูจำลองยังต้องถูกปฏิเสธสิทธิ์อ่านก่อนอนุมัติ");
  }));

  flowApprove.addEventListener("click",()=>work(flowApprove,async()=>{
    await verifyRole("director");
    const target=documentReference(),snap=await getDoc(target);
    if(!snap.exists()||snap.data().status!=="pending-director")
      throw new Error("หนังสือยังไม่อยู่ในสถานะรอ ผอ. อนุมัติ");
    // Director rules permit ONLY this one status transition.
    await updateDoc(target,{status:"approved"});
    flowStatus.textContent=statusLabel.approved;
    feedback("✅ ผอ. อนุมัติหนังสือจำลองแล้ว\nขั้นต่อไป: เข้า test_teacher เพื่อรับทราบ");
  }));

  flowAcknowledge.addEventListener("click",()=>work(flowAcknowledge,async()=>{
    await verifyRole("teacher");
    if(auth.currentUser.uid!==USER_UIDS.teacher)throw new Error("ไม่ใช่ครูจำลองที่กำหนด");
    const target=documentReference(),snap=await getDoc(target);
    if(!snap.exists()||snap.data().status!=="approved")
      throw new Error("ครูรับทราบได้เฉพาะหนังสือที่ ผอ. อนุมัติแล้ว");
    const receipt=doc(target,"receipts",USER_UIDS.teacher);
    if((await getDoc(receipt)).exists()){
      feedback("✅ ครูจำลองรับทราบหนังสือนี้แล้ว (ไม่บันทึกซ้ำ)");return;
    }
    await setDoc(receipt,{uid:USER_UIDS.teacher,acknowledgedAt:serverTimestamp()});
    flowStatus.textContent="อนุมัติแล้ว — ครูรับทราบแล้ว";
    feedback("✅ ครูจำลองรับทราบสำเร็จ\nบันทึกเฉพาะ receipt ของ TEST_TEACHER_001");
  }));

  flowRefresh.addEventListener("click",()=>work(flowRefresh,async()=>{
    const identity=SYNTHETIC_USERS.find(person=>person.uid===auth.currentUser?.uid);
    if(!identity)throw new Error("กรุณาเข้าสู่ระบบด้วยบัญชีจำลองก่อน");
    await verifyRole(identity.role);
    const target=documentReference();
    const snap=await getDoc(target);
    if(!snap.exists())throw new Error("ไม่พบหนังสือจำลองนี้");
    if(identity.uid===USER_UIDS.teacher && snap.data().status!=="approved"){
      flowStatus.textContent="⚠️ ไม่ผ่าน: ครูอ่านหนังสือก่อนอนุมัติได้";
      feedback("Firestore Rules ทดสอบยังไม่ปิดสิทธิ์อ่านระหว่างรออนุมัติ กรุณา Publish Rules รุ่นล่าสุดในโครงการ bhs-edoc-security-test");
      return;
    }
    flowStatus.textContent=(statusLabel[snap.data().status]||snap.data().status)+
      "\nหัวข้อ: "+snap.data().title;
    let note="✅ อ่านข้อมูลหนังสือจำลองได้ตามสิทธิ์";
    if(identity.uid===USER_UIDS.teacher && snap.data().status==="approved"){
      const receipt=await getDoc(doc(target,"receipts",USER_UIDS.teacher));
      note+="\nการรับทราบ: "+(receipt.exists()?"รับทราบแล้ว":"ยังไม่รับทราบ");
    }
    feedback(note);
  }));

  flowCopy.addEventListener("click",async()=>{
    const id=flowId.value.trim();
    if(!FLOW_ID_PATTERN.test(id)){feedback("ยังไม่มีรหัสหนังสือจำลองให้คัดลอก");return;}
    try{
      await navigator.clipboard.writeText(id);
      feedback("คัดลอกรหัสเอกสารแล้ว สามารถใช้ตอนสลับบัญชีหรือเบราว์เซอร์ได้");
    }catch{
      flowId.focus();flowId.select();
      feedback("เลือกข้อความรหัสเอกสารแล้ว ให้กด Ctrl+C เพื่อคัดลอก");
    }
  });
}catch(error){
  projectLabel.textContent="BLOCKED";
  setup.textContent="หยุดการเชื่อมต่อ Firebase ทดสอบ: "+error.message;
  probe.disabled=true;login.disabled=true;workflow.hidden=true;
}
