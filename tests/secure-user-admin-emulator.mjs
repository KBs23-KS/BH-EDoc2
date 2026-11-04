/**
 * REAL BHS admin-account API + private credential service against 127.0.0.1
 * Firestore Emulator ONLY. All accounts and all secrets are synthetic.
 */
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {initializeApp,deleteApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import secureUsersHandler from "../api/secure-users.js";
import {
  migrateSyntheticUserCredential,verifyPrivateSchoolPassword,
  VAULT_COLLECTION,assertCredentialVaultBoundary
} from "../api/_schoolCredentialVault.js";
import {
  appSessionFingerprint,makeAppSession
} from "../api/_signatureServer.js";
import {normalizeUsername} from "../shared/username.js";

const PROJECT="bhs-edoc-security-test",HOST="127.0.0.1:8099";
if(process.env.FIRESTORE_EMULATOR_HOST!==HOST)
  throw Error("Emulator-only test refuses remote Firestore");
const OLD_KEYS=[
  "VERCEL_ENV","BHS_SERVER_ISOLATED_PREVIEW","BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW",
  "BHS_CREDENTIAL_VAULT_AUDITED","BHS_ENABLE_SECURE_USERS_PREVIEW",
  "BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON","BHS_TEST_SESSION_SECRET"
];
const old=Object.fromEntries(OLD_KEYS.map(k=>[k,process.env[k]]));
const {privateKey}=generateKeyPairSync("rsa",{
  modulusLength:2048,
  publicKeyEncoding:{type:"spki",format:"pem"},
  privateKeyEncoding:{type:"pkcs8",format:"pem"}
});
Object.assign(process.env,{
  VERCEL_ENV:"preview",
  BHS_SERVER_ISOLATED_PREVIEW:"true",
  BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW:"true",
  BHS_CREDENTIAL_VAULT_AUDITED:"true",
  BHS_ENABLE_SECURE_USERS_PREVIEW:"true",
  BHS_TEST_SESSION_SECRET:"FAKE_TEST_SESSION_SECRET_".repeat(4),
  BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
    project_id:PROJECT,
    client_email:"fake-admin-emulator@"+PROJECT+".iam.gserviceaccount.com",
    private_key:privateKey
  })
});
const app=initializeApp({projectId:PROJECT},"test-admin-account-crud");
const db=getFirestore(app);
const path="artifacts/bhs-edoc-app/public/data/";
const users=db.collection(path+"bhs_users");
const audits=db.collection(path+"bhs_audit_logs");
const adminId="TEST_ADMIN_001",teacherId="TEST_TEACHER_001";
const env=process.env;
function res(){
  return {headers:{},statusCode:200,body:null,
    setHeader(k,v){this.headers[k]=v;return this;},
    status(n){this.statusCode=n;return this;},
    json(data){this.body=data;return this;}
  };
}
async function session(uid){
  const snap=await users.doc(uid).get();
  assert.equal(snap.exists,true);
  return "bhs_app_session="+makeAppSession(uid,appSessionFingerprint(snap.data()));
}
async function request(uid,action,form={},targetId){
  const cookies=await session(uid);
  const response=res();
  await secureUsersHandler({
    method:"POST",
    headers:{
      host:"localhost",
      "content-type":"application/json",
      cookie:cookies,
      "sec-fetch-site":"same-origin"
    },
    body:{action,targetId,form}
  },response);
  return response;
}
function accepted(r){assert.equal(r.statusCode,200,JSON.stringify(r.body));assert.equal(r.body.success,true);}
function denied(r,expected){assert.equal(r.statusCode,expected,JSON.stringify(r.body));assert.equal(r.body?.success,false);}
try{
  for(const [id,profile] of [
    [adminId,{name:"ผู้ดูแลจำลอง",username:"ADMIN",role:"admin",
      adminDept:"-",subjectArea:"-",status:"active",password:"admin-old"}],
    [teacherId,{name:"ครูจำลอง",username:"t001",role:"teacher",
      adminDept:"-",subjectArea:"วิทยาศาสตร์",status:"active",password:"a"}]
  ]){
    const doc=users.doc(id);
    await doc.set(profile);
    await migrateSyntheticUserCredential({
      db,projectId:PROJECT,profileRef:doc,uid:id,env
    });
  }
  const adminProfileBefore=(await users.doc(adminId).get()).data();
  const teacherProfileBefore=(await users.doc(teacherId).get()).data();
  const teacherTag=appSessionFingerprint(teacherProfileBefore);
  const adminCookie=await session(adminId);

  denied(await request(teacherId,"status",{status:"inactive"},adminId),403);
  const newAccount={
    name:"ครูใหม่จำลอง",username:"NewTeacher",role:"teacher",
    adminDept:"-",subjectArea:"คณิตศาสตร์",status:"active",
    password:"สั้น"
  };
  let response=await request(adminId,"create",newAccount);
  accepted(response);
  const id=response.body.userId;
  assert.match(id,/^TEST_USER_[A-F0-9]{24}$/);
  let newUser=(await users.doc(id).get()).data();
  assert.equal(newUser.username,newAccount.username);
  assert.equal(Object.hasOwn(newUser,"password"),false);
  assert.equal(await verifyPrivateSchoolPassword({
    db,projectId:PROJECT,user:{id,...newUser},password:"สั้น",env
  }),true);
  assert.equal((await db.collection(VAULT_COLLECTION).doc(id).get()).exists,true);
  assert.ok(!JSON.stringify(response.body).includes("password"));
  assert.ok(!JSON.stringify(response.body).includes("credentialVersion"));
  assert.ok(!JSON.stringify(response.body).includes("hash"));

  denied(await request(adminId,"create",{...newAccount,username:"newteacher"}),400);
  denied(await request(adminId,"create",{...newAccount,username:"T001"}),400);
  denied(await request(adminId,"create",{...newAccount,password:""}),400);
  assert.equal((await users.get()).size,3,"denied create must not create records");

  response=await request(adminId,"edit",{
    ...newAccount,name:"ปรับชื่อ แต่ไม่เปลี่ยนรหัส",password:""
  },id);
  accepted(response);
  newUser=(await users.doc(id).get()).data();
  assert.equal(newUser.name,"ปรับชื่อ แต่ไม่เปลี่ยนรหัส");
  assert.equal(await verifyPrivateSchoolPassword({
    db,projectId:PROJECT,user:{id,...newUser},password:"สั้น",env
  }),true,"blank edit-password means unchanged");
  denied(await request(adminId,"edit",{
    ...newAccount,username:"t001",password:""
  },id),400);
  assert.equal((await users.doc(id).get()).data().username,"NewTeacher");

  response=await request(adminId,"status",{status:"inactive"},id);
  accepted(response);
  let disabled=(await users.doc(id).get()).data();
  assert.equal(disabled.status,"inactive");
  assert.equal(await verifyPrivateSchoolPassword({
    db,projectId:PROJECT,user:{id,...disabled},password:"สั้น",env
  }),false,"disabled profile and private credential must deny login");
  denied(await request(adminId,"status",{status:"inactive"},adminId),403);

  response=await request(adminId,"status",{status:"active"},id);
  accepted(response);
  const beforeReset=(await users.doc(id).get()).data();
  const beforeTag=appSessionFingerprint(beforeReset);
  response=await request(adminId,"edit",{
    ...newAccount,name:"ครูจำลองหลังเปลี่ยนรหัส",password:"รหัสใหม่เฉพาะคนนี้"
  },id);
  accepted(response);
  newUser=(await users.doc(id).get()).data();
  assert.notEqual(appSessionFingerprint(newUser),beforeTag);
  assert.equal(await verifyPrivateSchoolPassword({
    db,projectId:PROJECT,user:{id,...newUser},password:"สั้น",env
  }),false);
  assert.equal(await verifyPrivateSchoolPassword({
    db,projectId:PROJECT,user:{id,...newUser},password:"รหัสใหม่เฉพาะคนนี้",env
  }),true);
  // Unrelated users retain both username, role and password.
  const originalTeacher=(await users.doc(teacherId).get()).data();
  assert.equal(originalTeacher.username,"t001");
  assert.equal(appSessionFingerprint(originalTeacher),teacherTag);
  assert.equal(await verifyPrivateSchoolPassword({
    db,projectId:PROJECT,user:{id:teacherId,...originalTeacher},password:"a",env
  }),true);
  const originalAdmin=(await users.doc(adminId).get()).data();
  assert.equal(originalAdmin.username,"ADMIN");
  assert.equal(await verifyPrivateSchoolPassword({
    db,projectId:PROJECT,user:{id:adminId,...originalAdmin},password:"admin-old",env
  }),true);

  denied(await request(adminId,"delete",{},adminId),403);
  response=await request(adminId,"delete",{},id);
  accepted(response);
  assert.equal((await users.doc(id).get()).exists,false);
  assert.equal((await db.collection(VAULT_COLLECTION).doc(id).get()).exists,false);

  // User-facing API does not accept a cross-origin request or untrusted token.
  const cross=res();
  await secureUsersHandler({
    method:"POST",
    headers:{host:"localhost",origin:"https://attacker.example","content-type":"application/json",cookie:adminCookie},
    body:{action:"delete",targetId:teacherId}
  },cross);
  denied(cross,403);
  assert.equal((await users.doc(teacherId).get()).exists,true);
  assert.ok((await audits.get()).size>=6,"successful operations must write audit logs");

  assert.throws(()=>assertCredentialVaultBoundary({
    projectId:"bhs-edoc-2",env
  }),/credential_vault_isolated_test_only/);
  assert.equal(normalizeUsername("T001"),normalizeUsername("t001"));
  console.log("PASS: isolated BHS account API CRUD, unique usernames, unchanged old passwords,"+
    " admin-only roles, private reset, status, revoked sessions and atomic audit");
}finally{
  await deleteApp(app);
  for(const [key,value] of Object.entries(old)){
    if(value===undefined)delete process.env[key];
    else process.env[key]=value;
  }
}
