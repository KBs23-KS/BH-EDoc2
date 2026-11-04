/** Isolated Firestore Emulator end-to-end incoming register API test.
 * No live Firebase, no GAS/Drive, no school files or real passwords.
 */
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {initializeApp,deleteApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {makeAppSession,appSessionFingerprint} from "../api/_signatureServer.js";
import {migrateSyntheticUserCredential} from "../api/_schoolCredentialVault.js";
import documentHandler from "../api/secure-documents.js";
const PROJECT="bhs-edoc-security-test",HOST="127.0.0.1:8099";
if(process.env.FIRESTORE_EMULATOR_HOST!==HOST)throw Error("Emulator-only test refused");
const ENV_KEYS=[
  "VERCEL_ENV","BHS_SERVER_ISOLATED_PREVIEW","BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW",
  "BHS_CREDENTIAL_VAULT_AUDITED","BHS_ENABLE_SECURE_DOCUMENTS_PREVIEW",
  "BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON","BHS_TEST_SESSION_SECRET"
];
const previous=Object.fromEntries(ENV_KEYS.map(k=>[k,process.env[k]]));
const {privateKey}=generateKeyPairSync("rsa",{
  modulusLength:2048,publicKeyEncoding:{type:"spki",format:"pem"},
  privateKeyEncoding:{type:"pkcs8",format:"pem"}
});
Object.assign(process.env,{
  VERCEL_ENV:"preview",BHS_SERVER_ISOLATED_PREVIEW:"true",
  BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW:"true",
  BHS_CREDENTIAL_VAULT_AUDITED:"true",
  BHS_ENABLE_SECURE_DOCUMENTS_PREVIEW:"true",
  BHS_TEST_SESSION_SECRET:"FAKE_DOC_SESSION_SECRET_".repeat(4),
  BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
    project_id:PROJECT,
    client_email:"fake-doc-emulator@"+PROJECT+".iam.gserviceaccount.com",
    private_key:privateKey
  })
});
const app=initializeApp({projectId:PROJECT},"test-incoming-doc-registration");
const db=getFirestore(app);
const path="artifacts/bhs-edoc-app/public/data/";
const users=db.collection(path+"bhs_users");
const docs=db.collection(path+"bhs_documents");
const audit=db.collection(path+"bhs_audit_logs");
const sample={subject:"หนังสือเข้าจำลอง",docNumber:"001/2569",
  date:"2026-11-04",urgency:"ปกติ",from:"หน่วยงานจำลอง"};
const clerkId="TEST_CLERK_001",adminId="TEST_ADMIN_001",
  teacherId="TEST_TEACHER_001";
function res(){
  return {headers:{},statusCode:200,body:null,
    setHeader(k,v){this.headers[k]=v;return this;},
    status(n){this.statusCode=n;return this;},
    json(data){this.body=data;return this;}
  };
}
async function request(uid,action,form={},docId){
  const account=await users.doc(uid).get();
  assert.equal(account.exists,true);
  const cookie="bhs_app_session="+makeAppSession(uid,appSessionFingerprint(account.data()));
  const output=res();
  await documentHandler({
    method:"POST",
    headers:{"content-type":"application/json",
      "sec-fetch-site":"same-origin",cookie,host:"localhost"},
    body:{action,docId,form}
  },output);
  return output;
}
function pass(output){assert.equal(output.statusCode,200,JSON.stringify(output.body));assert.equal(output.body.success,true);}
function denied(output,status){assert.equal(output.statusCode,status,JSON.stringify(output.body));}
try {
  for(const [uid,role] of [[clerkId,"clerk"],[adminId,"admin"],[teacherId,"teacher"]]){
    const ref=users.doc(uid);
    await ref.set({username:"synthetic_"+role,name:"ผู้ใช้งานจำลอง",
      status:"active",role,adminDept:"-",subjectArea:"-",
      password:"fake-"+role});
    await migrateSyntheticUserCredential({
      db,profileRef:ref,uid,projectId:PROJECT
    });
  }

  denied(await request(teacherId,"create",sample),403);
  denied(await request(clerkId,"create",{
    ...sample,files:[{driveId:"FAKE_UNVERIFIED_DRIVE"}]
  }),400);
  denied(await request(clerkId,"create",{
    ...sample,signedFiles:[{name:"signature.pdf"}]
  }),400);
  denied(await request(clerkId,"create",{...sample,docNumber:""}),400);
  denied(await request(clerkId,"create",{...sample,date:"2026-02-31"}),400);

  let r=await request(clerkId,"create",sample);
  pass(r);
  const firstId=r.body.docId;
  assert.match(firstId,/^TEST_DOC_[A-F0-9]{24}$/);
  let first=(await docs.doc(firstId).get()).data();
  assert.equal(first.status,"รอรองผู้อำนวยการ");
  assert.equal(first.createdBy,clerkId);
  assert.equal(first.type,"หนังสือเข้า");
  assert.deepEqual(first.files,[]);
  assert.deepEqual(first.signedFiles,[]);
  assert.equal(first.fileVersions.length,1);
  assert.equal(first.history.length,1);
  assert.equal(first.isDeleted,false);

  denied(await request(clerkId,"create",{...sample,docNumber:"1/2569"}),400);
  denied(await request(adminId,"create",{...sample,docNumber:"0001/2569"}),400);
  // Different book year is a distinct register.
  r=await request(adminId,"create",{
    ...sample,date:"2027-01-05",docNumber:"1/2569"
  });
  pass(r);

  denied(await request(teacherId,"edit",{...sample,subject:"FORGED"},firstId),403);
  denied(await request(clerkId,"edit",{...sample,docNumber:"1/2569",files:[]},firstId),400);
  r=await request(clerkId,"edit",{
    ...sample,subject:"แก้เฉพาะหัวข้อ เอกสารเดิม"
  },firstId);
  pass(r);
  first=(await docs.doc(firstId).get()).data();
  assert.equal(first.subject,"แก้เฉพาะหัวข้อ เอกสารเดิม");
  assert.equal(first.history.length,2);
  assert.equal(first.status,"รอรองผู้อำนวยการ");
  assert.equal(first.fileVersions.length,1);

  // Changing number collision must be rejected, keeping original fields.
  const second=await request(adminId,"create",{
    ...sample,docNumber:"2/2569"
  });
  pass(second);
  denied(await request(clerkId,"edit",{
    ...sample,docNumber:"2/2569"
  },firstId),400);
  assert.equal((await docs.doc(firstId).get()).data().docNumber,"001/2569");

  denied(await request(teacherId,"soft-delete",{},firstId),403);
  r=await request(clerkId,"soft-delete",{},firstId);
  pass(r);
  assert.equal((await docs.doc(firstId).get()).data().isDeleted,true);
  denied(await request(clerkId,"soft-delete",{},firstId),403);

  // Once a document is in the trash, its number may be reused per existing
  // BHS policy; old document remains in history (not hard-deleted).
  r=await request(clerkId,"create",sample);
  pass(r);
  assert.notEqual(r.body.docId,firstId);
  assert.equal((await docs.doc(r.body.docId).get()).data().docNumber,"001/2569");

  const counter=await db.doc(path+"bhs_number_counters/INCOMING-2569").get();
  assert.equal(counter.exists,true);
  assert.ok(counter.data().revision>=4);
  assert.ok((await audit.get()).size>=6);
  for(const item of (await audit.get()).docs){
    assert.equal("password" in item.data(),false);
    assert.equal("passwordHash" in item.data(),false);
  }
  console.log("PASS: isolated BHS incoming register API, duplicate year lock,"+
    " clerk/admin-only create/edit/trash, history and transactional audit");
}finally{
  await deleteApp(app);
  for(const [key,value] of Object.entries(previous)){
    if(value===undefined)delete process.env[key];
    else process.env[key]=value;
  }
}
