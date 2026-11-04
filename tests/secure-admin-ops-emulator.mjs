/**
 * School settings and manual number override, actual HTTP handlers in
 * Firestore Emulator ONLY, fictional accounts. Never touches real Firebase.
 */
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {initializeApp,deleteApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {makeAppSession,appSessionFingerprint} from "../api/_signatureServer.js";
import {migrateSyntheticUserCredential} from "../api/_schoolCredentialVault.js";
import adminHandler from "../api/secure-admin.js";
import registerHandler from "../api/secure-register.js";
const PROJECT="bhs-edoc-security-test",HOST="127.0.0.1:8099";
if(process.env.FIRESTORE_EMULATOR_HOST!==HOST)
  throw Error("Refuse any school-admin test outside localhost Firestore");
const keys=["VERCEL_ENV","BHS_SERVER_ISOLATED_PREVIEW",
  "BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW","BHS_CREDENTIAL_VAULT_AUDITED",
  "BHS_ENABLE_SECURE_ADMIN_PREVIEW","BHS_ENABLE_SECURE_REGISTER_PREVIEW",
  "BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON","BHS_TEST_SESSION_SECRET"];
const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
const {privateKey}=generateKeyPairSync("rsa",{
  modulusLength:2048,publicKeyEncoding:{type:"spki",format:"pem"},
  privateKeyEncoding:{type:"pkcs8",format:"pem"}
});
Object.assign(process.env,{
  VERCEL_ENV:"preview",BHS_SERVER_ISOLATED_PREVIEW:"true",
  BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW:"true",
  BHS_CREDENTIAL_VAULT_AUDITED:"true",
  BHS_ENABLE_SECURE_ADMIN_PREVIEW:"true",
  BHS_ENABLE_SECURE_REGISTER_PREVIEW:"true",
  BHS_TEST_SESSION_SECRET:"LOCAL_ADMIN_REHEARSAL_".repeat(4),
  BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
    project_id:PROJECT,
    client_email:"fake-admin-settings@"+PROJECT+".iam.gserviceaccount.com",
    private_key:privateKey
  })
});
const app=initializeApp({projectId:PROJECT},"test-secure-admin-operations");
const db=getFirestore(app);
const root="artifacts/bhs-edoc-app/public/data/";
const users=db.collection(root+"bhs_users");
const admin="TEST_ADMIN_001",teacher="TEST_TEACHER_001";
function res(){return {
  headers:{},statusCode:200,body:null,
  setHeader(k,v){this.headers[k]=v;return this;},
  status(n){this.statusCode=n;return this;},
  json(data){this.body=data;return this;}
};}
async function cookie(uid){
  const u=await users.doc(uid).get();
  assert.equal(u.exists,true);
  return "bhs_app_session="+makeAppSession(uid,appSessionFingerprint(u.data()));
}
async function adminCall(uid,method,body={},query={}){
  const output=res();
  await adminHandler({
    method,headers:{host:"localhost",cookie:await cookie(uid),
      "content-type":"application/json","sec-fetch-site":"same-origin"},
    query,body
  },output);
  return output;
}
async function reserve(uid,subject="หนังสือจำลอง"){
  const output=res();
  await registerHandler({
    method:"POST",headers:{host:"localhost",cookie:await cookie(uid),
      "content-type":"application/json","sec-fetch-site":"same-origin"},
    body:{action:"create",kind:"ORDER",form:{
      subject,responsibleDept:"กลุ่มวิชาการ",remark:"",
      date:"2026-11-04"
    }}
  },output);
  return output;
}
function ok(r){assert.equal(r.statusCode,200,JSON.stringify(r.body));assert.equal(r.body.success,true);}
function denied(r,status){assert.equal(r.statusCode,status,JSON.stringify(r.body));}
try{
  for(const [uid,role] of [[admin,"admin"],[teacher,"teacher"]]){
    const ref=users.doc(uid);
    await ref.set({
      username:uid,name:role+" fake",role,status:"active",
      adminDept:"-",subjectArea:"-",password:"fake-local-only"
    });
    await migrateSyntheticUserCredential({
      db,projectId:PROJECT,profileRef:ref,uid
    });
  }
  denied(await adminCall(teacher,"GET",{},{
    kind:"ORDER",year:"2569"
  }),403);
  denied(await adminCall(teacher,"POST",{
    action:"set-next",kind:"ORDER",year:2569,nextNumber:5
  }),403);
  denied(await adminCall(admin,"POST",{
    action:"set-next",kind:"ORDER",year:2569,nextNumber:0
  }),400);
  denied(await adminCall(admin,"POST",{
    action:"set-next",kind:"ORDER",year:2569,nextNumber:1.5
  }),400);
  denied(await adminCall(admin,"POST",{
    action:"set-next",kind:"ORDER",year:2569,nextNumber:1,
    unsafeClientField:"FORGED"
  }),400);
  let r=await adminCall(admin,"GET",{},{
    kind:"ORDER",year:"2569"
  });
  ok(r);assert.equal(r.body.counter,null);
  assert.equal(r.body.highest,0);
  r=await adminCall(admin,"POST",{
    action:"set-next",kind:"ORDER",year:2569,nextNumber:5
  });
  ok(r);assert.equal(r.body.counter.lastNumber,4);
  assert.equal(r.body.effectiveNext,"5/2569");
  r=await reserve(teacher,"เอกสารเลข 5");
  ok(r);assert.equal(r.body.number,"5/2569");
  r=await adminCall(admin,"POST",{
    action:"set-next",kind:"ORDER",year:2569,nextNumber:5
  });
  ok(r);assert.equal(r.body.effectiveNext,"6/2569");
  r=await reserve(teacher,"เอกสารเลข 6");
  ok(r);assert.equal(r.body.number,"6/2569");
  r=await adminCall(admin,"GET",{},{
    kind:"ORDER",year:"2569"
  });
  ok(r);assert.equal(r.body.highest,6);
  assert.equal(r.body.counter.lastNumber,6);
  assert.ok(r.body.history.length>=2);
  assert.equal(JSON.stringify(r.body.history).includes("password"),false);
  // A new year starts independently, and manual backward resets can only
  // result in an UNUSED number selected by the backend.
  r=await adminCall(admin,"POST",{
    action:"set-next",kind:"ORDER",year:2570,nextNumber:1
  });
  ok(r);assert.equal(r.body.effectiveNext,"1/2570");
  r=await adminCall(admin,"POST",{
    action:"set-next",kind:"ORDER",year:2569,nextNumber:5
  });
  ok(r);assert.equal(r.body.effectiveNext,"7/2569");

  const settings={
    schoolName:"โรงเรียนจำลอง",schoolLogoText:"จ.ร.",
    academicYear:"2569",fiscalYear:"2569",
    adminDepts:["กลุ่มวิชาการ"],subjectAreas:["วิทยาศาสตร์"],
    adminHeads:{"กลุ่มวิชาการ":{primary:teacher,acting:""}},
    subjectHeads:{"วิทยาศาสตร์":teacher}
  };
  denied(await adminCall(teacher,"POST",{
    action:"save-settings",settings
  }),403);
  denied(await adminCall(admin,"POST",{
    action:"save-settings",settings:{...settings,password:"NEVER"}
  }),400);
  denied(await adminCall(admin,"POST",{
    action:"save-settings",settings:{...settings,
      subjectAreas:["วิทยาศาสตร์","วิทยาศาสตร์"]}
  }),400);
  r=await adminCall(admin,"POST",{
    action:"save-settings",settings
  });
  ok(r);
  const stored=(await db.doc(root+"bhs_settings/system").get()).data();
  assert.equal(stored.schoolName,settings.schoolName);
  assert.equal(stored.adminHeads["กลุ่มวิชาการ"].primary,teacher);
  assert.equal(stored.subjectHeads["วิทยาศาสตร์"],teacher);
  assert.equal("password" in stored,false);
  assert.equal((await db.collection(root+"bhs_audit_logs").get()).docs
    .filter(x=>x.data().action==="แก้ไขการตั้งค่าระบบ").length,1);
  // An admin whose status changes can no longer read or update settings.
  await users.doc(admin).update({status:"inactive"});
  denied(await adminCall(admin,"GET",{},{
    kind:"ORDER",year:"2569"
  }),401);
  console.log("PASS: isolated admin register override, skip occupied numbers,"+
    " restart per year, protected settings, audit and revoked admin sessions");
}finally{
  await deleteApp(app);
  for(const [key,value] of Object.entries(old)){
    if(value===undefined)delete process.env[key];
    else process.env[key]=value;
  }
}
