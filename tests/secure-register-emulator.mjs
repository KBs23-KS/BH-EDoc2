/**
 * End-to-end order/outgoing number transactions using the REAL server API.
 * Synthetic users and localhost Firestore Emulator only, no production data.
 */
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {initializeApp,deleteApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {makeAppSession,appSessionFingerprint} from "../api/_signatureServer.js";
import {migrateSyntheticUserCredential} from "../api/_schoolCredentialVault.js";
import registerHandler from "../api/secure-register.js";
const HOST="127.0.0.1:8099",PROJECT="bhs-edoc-security-test";
if(process.env.FIRESTORE_EMULATOR_HOST!==HOST)
  throw Error("STOP: register test may use local Emulator only");
const keys=["VERCEL_ENV","BHS_SERVER_ISOLATED_PREVIEW",
  "BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW","BHS_CREDENTIAL_VAULT_AUDITED",
  "BHS_ENABLE_SECURE_REGISTER_PREVIEW","BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON",
  "BHS_TEST_SESSION_SECRET"];
const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
const {privateKey}=generateKeyPairSync("rsa",{
  modulusLength:2048,publicKeyEncoding:{type:"spki",format:"pem"},
  privateKeyEncoding:{type:"pkcs8",format:"pem"}
});
Object.assign(process.env,{
  VERCEL_ENV:"preview",BHS_SERVER_ISOLATED_PREVIEW:"true",
  BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW:"true",
  BHS_CREDENTIAL_VAULT_AUDITED:"true",
  BHS_ENABLE_SECURE_REGISTER_PREVIEW:"true",
  BHS_TEST_SESSION_SECRET:"FAKE_REGISTER_TEST_".repeat(4),
  BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
    project_id:PROJECT,
    client_email:"fake-emulator-register@"+PROJECT+".iam.gserviceaccount.com",
    private_key:privateKey
  })
});
const app=initializeApp({projectId:PROJECT},"test-register-server-emulator");
const db=getFirestore(app);
const root="artifacts/bhs-edoc-app/public/data/";
const profiles=db.collection(root+"bhs_users"),logs=db.collection(root+"bhs_audit_logs");
const orderRows=db.collection(root+"bhs_order_reservations");
const outRows=db.collection(root+"bhs_outgoing_reservations");
const uid={
  admin:"TEST_ADMIN_001",clerk:"TEST_CLERK_001",
  teacher:"TEST_TEACHER_001",outside:"TEST_OUTSIDER_001"
};
function reply(){return {
  headers:{},statusCode:200,body:null,
  setHeader(k,v){this.headers[k]=v;return this;},
  status(n){this.statusCode=n;return this;},
  json(data){this.body=data;return this;}
};}
async function command(who,kind,action,form={},reservationId){
  const profile=await profiles.doc(who).get();
  assert.ok(profile.exists);
  const cookie="bhs_app_session="+makeAppSession(who,
    appSessionFingerprint(profile.data()));
  const output=reply();
  await registerHandler({
    method:"POST",
    headers:{"content-type":"application/json",host:"localhost",
      "sec-fetch-site":"same-origin",cookie},
    body:{kind,action,form,reservationId}
  },output);
  return output;
}
function pass(output){assert.equal(output.statusCode,200,JSON.stringify(output.body));assert.equal(output.body.success,true);}
function denied(output,status){assert.equal(output.statusCode,status,JSON.stringify(output.body));}
const fields=(date="2026-11-04",subject="เอกสารจำลอง")=>({
  subject,date,responsibleDept:"กลุ่มบริหารวิชาการ",remark:"ทดสอบเท่านั้น"
});
try{
  for(const [id,role,status] of [
    [uid.admin,"admin","active"],[uid.clerk,"clerk","active"],
    [uid.teacher,"teacher","active"],[uid.outside,"teacher","inactive"]
  ]){
    const ref=profiles.doc(id);
    await ref.set({username:id,name:"ผู้ใช้จำลอง",role,status,
      adminDept:"กลุ่มบริหารวิชาการ",subjectArea:"-",
      password:"FAKE_PRIVATE_PASSWORD"});
    await migrateSyntheticUserCredential({db,profileRef:ref,uid:id,projectId:PROJECT});
  }
  let output=await command(uid.clerk,"ORDER","create",fields());
  pass(output);
  assert.equal(output.body.number,"1/2569");
  const first=output.body.reservationId;
  assert.match(first,/^TEST_RES_[A-F0-9]{24}$/);
  assert.equal((await orderRows.doc(first).get()).data().createdBy,uid.clerk);

  output=await command(uid.teacher,"ORDER","create",fields("2026-11-04","ลำดับ 2"));
  pass(output);assert.equal(output.body.number,"2/2569");
  const second=output.body.reservationId;
  // Different register types have different sequences.
  output=await command(uid.teacher,"OUT","create",fields());
  pass(output);assert.equal(output.body.number,"1/2569");
  const firstOutgoing=output.body.reservationId;
  output=await command(uid.clerk,"ORDER","create",fields("2027-01-02"));
  pass(output);assert.equal(output.body.number,"1/2570");

  // An inactive account cannot reserve or cancel.
  denied(await command(uid.outside,"ORDER","create",fields()),401);
  denied(await command(uid.teacher,"ORDER","edit",fields(),first),403);
  denied(await command(uid.teacher,"OUT","cancel",{},firstOutgoing),403);
  denied(await command(uid.admin,"ORDER","edit",{
    ...fields(),orderNumber:"999/2569"
  },second),400);
  denied(await command(uid.clerk,"ORDER","edit",fields("2027-01-05"),first),400);
  denied(await command(uid.teacher,"ORDER","create",{
    ...fields(),files:[{driveId:"UNVERIFIED"}]
  }),400);
  denied(await command(uid.teacher,"OUT","create",{
    ...fields(),signedFiles:[{name:"fake.pdf"}]
  }),400);

  output=await command(uid.clerk,"ORDER","edit",fields("2026-11-04","เปลี่ยนชื่อเรื่อง"),first);
  pass(output);
  assert.equal((await orderRows.doc(first).get()).data().orderNumber,"1/2569");
  assert.equal((await orderRows.doc(first).get()).data().subject,"เปลี่ยนชื่อเรื่อง");
  output=await command(uid.clerk,"ORDER","cancel",{},first);
  pass(output);
  assert.equal((await orderRows.doc(first).get()).data().status,"canceled");
  denied(await command(uid.clerk,"ORDER","edit",fields(),first),403);

  // Canceling does NOT reissue a canceled number.
  output=await command(uid.admin,"ORDER","create",fields());
  pass(output);assert.equal(output.body.number,"3/2569");

  // A reservation attached to an order may not be canceled or renumbered
  // through this ordinary API.
  await orderRows.doc(second).update({linkedDocumentId:"TEST_FAKE_PDF_DOC",status:"linked"});
  denied(await command(uid.teacher,"ORDER","cancel",{},second),403);
  denied(await command(uid.admin,"ORDER","edit",fields(),second),403);

  // Two concurrent callers must never receive the same new order number.
  const [a,b]=await Promise.all([
    command(uid.teacher,"OUT","create",fields("2026-11-05","แข่ง 1")),
    command(uid.clerk,"OUT","create",fields("2026-11-05","แข่ง 2"))
  ]);
  pass(a);pass(b);
  assert.notEqual(a.body.number,b.body.number);

  const counter=await db.doc(root+"bhs_number_counters/ORDER-2569").get();
  assert.equal(counter.data().lastNumber,3);
  const outCounter=await db.doc(root+"bhs_number_counters/OUT-2569").get();
  assert.equal(outCounter.data().lastNumber,3);
  assert.ok((await logs.get()).size>=8);
  assert.equal((await outRows.doc(firstOutgoing).get()).data().status,"reserved");
  console.log("PASS: school ORDER/OUT transactional numbering, year reset,"+
    " no canceled reissue, ownership, linked-document lock and concurrent safety");
}finally{
  await deleteApp(app);
  for(const [key,value] of Object.entries(original)){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
}
