/**
 * End-to-end HTTP -> verified identity -> live profile/role -> Firestore
 * Admin transaction + audit, against ONLY localhost port 8099.
 * Test tokens below are deliberately FAKE, NOT real Firebase ID tokens.
 */
import assert from "node:assert/strict";
import {initializeApp,deleteApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {IDS,USERS,SETTINGS,DOC_IDS,ADMIN_GROUP,SUBJECT_GROUP,
  REVISED_PDF,FAKE_PDF,startingDocuments} from "./fixtures/bhs-realistic-synthetic.mjs";
import {createEmulatorCommandService} from "../security-test/backend/emulatorCommandService.mjs";
import {createLoopbackEmulatorServer} from "../security-test/backend/loopbackHttp.mjs";

const PROJECT="demo-bhs-realistic-only",HOST="127.0.0.1:8099";
if(process.env.FIRESTORE_EMULATOR_HOST!==HOST)throw new Error("Emulator-only test refused");
const app=initializeApp({projectId:PROJECT},"test-emulator-backend-suite");
const db=getFirestore(app);
const ROOT="artifacts/bhs-edoc-app/public/data/";
const col=name=>db.collection(ROOT+name);
const byId=id=>USERS.find(u=>u.id===id);
const tokens=uid=>"MOCK_ONLY_"+uid;
const mockedFirebaseAdminAuth={
  // Strict test double; real Firebase Admin verifyIdToken must be used in any
  // future production implementation. No signing or private keys involved.
  async verifyIdToken(token,checkRevoked){
    assert.equal(checkRevoked,true);
    if(token==="MOCK_ONLY_REVOKED")throw new Error("revoked");
    if(!/^MOCK_ONLY_TEST_[A-Z0-9_]+$/.test(token))
      throw new Error("invalid signature");
    const uid=token.slice("MOCK_ONLY_".length);
    return {uid,bhsSchoolIdentity:uid!==IDS.inactive,role:"admin"};
  }
};
const command=createEmulatorCommandService({db,auth:mockedFirebaseAdminAuth});
const server=createLoopbackEmulatorServer(command);
let url,count=0;
const request=async(uid,action,payload={},docId)=>{
  const response=await fetch(url,{
    method:"POST",
    headers:{"Content-Type":"application/json",
      "Authorization":"Bearer "+tokens(uid),"Origin":"http://localhost"},
    body:JSON.stringify({action,docId,payload})
  });
  const result=await response.json();
  count++;
  return {status:response.status,result};
};
const expect=(value,status)=>assert.equal(value.status,status,JSON.stringify(value.result));
const get=id=>col("bhs_documents").doc(id).get();
const auditCount=async()=>(await col("bhs_audit_logs").get()).size;
try{
  const batch=db.batch();
  for(const person of USERS){
    const {id,...data}=person;
    batch.set(col("bhs_users").doc(id),data);
  }
  batch.set(col("bhs_settings").doc("system"),SETTINGS);
  for(const item of startingDocuments()){
    const {id,...data}=item;
    batch.set(col("bhs_documents").doc(id),data);
  }
  await batch.commit();

  // The service MUST fail closed outside the exact emulator project.
  assert.throws(()=>createEmulatorCommandService({
    db:{app:{options:{projectId:"bhs-edoc-2"}}},auth:mockedFirebaseAdminAuth
  }),/emulator_only_service/);

  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  url="http://127.0.0.1:"+server.address().port+"/test-only/command";

  let result=await request(IDS.teacher,"deputy-review",{},DOC_IDS.incoming);
  expect(result,403);
  result=await request(IDS.inactive,"deputy-review",{},DOC_IDS.incoming);
  expect(result,403);
  const original=await get(DOC_IDS.incoming);
  assert.equal(original.data().status,"รอรองผู้อำนวยการ");
  result=await request(IDS.teacher,"unknown-action",{},DOC_IDS.incoming);
  expect(result,400);
  result=await request(IDS.director,"deputy-review",{},DOC_IDS.incoming);
  expect(result,403);
  result=await request(IDS.teacher,"check-sign-pdf",
    {driveId:FAKE_PDF.driveId},DOC_IDS.order);
  expect(result,403);
  result=await request(IDS.director,"check-sign-pdf",
    {driveId:FAKE_PDF.driveId},DOC_IDS.order);
  expect(result,200);
  assert.equal(result.result.readOnly,true);
  assert.equal((await get(DOC_IDS.order)).data().signedFiles.length,0);
  result=await request(IDS.admin,"check-sign-pdf",
    {driveId:"WRONG_FAKE_DRIVE_ID"},DOC_IDS.order);
  expect(result,403);

  // Create a new document, ignoring any attempts to forge fields/roles.
  result=await request(IDS.teacher,"create-incoming",
    {subject:"เอกสารปลอมจากครู"});expect(result,403);
  result=await request(IDS.clerk,"create-incoming",{
    subject:"หนังสือเข้าจำลอง ส่งกลับแก้ไข และมอบหมาย",
    role:"admin",status:"เผยแพร่แล้ว",recipientIds:[IDS.teacher],
    files:[{url:"https://example.com/private.pdf"}]
  });
  expect(result,200);
  const id=result.result.docId;
  assert.match(id,/^TEST_DOC_[A-Z0-9_]{3,80}$/);
  let stored=(await get(id)).data();
  assert.equal(stored.createdBy,IDS.clerk);
  assert.equal(stored.status,"รอรองผู้อำนวยการ");
  assert.deepEqual(stored.files,[]);
  assert.deepEqual(stored.recipientIds,[]);
  assert.equal("role" in stored,false);
  assert.equal((await col("bhs_audit_logs").where("targetId","==",id).get()).size,1);

  result=await request(IDS.deputy,"deputy-review",{comment:"รับเรื่องจำลอง"},id);
  expect(result,200);
  assert.equal((await get(id)).data().status,"รอผู้อำนวยการ");
  result=await request(IDS.deputy,"deputy-review",{},id);expect(result,403);
  result=await request(IDS.director,"return-correction",{reason:"แก้ไขต้นฉบับ"},id);
  expect(result,200);
  result=await request(IDS.teacher,"resubmit-revision",
    {nextVersion:2,revisionFiles:[REVISED_PDF]},id);expect(result,403);
  result=await request(IDS.clerk,"resubmit-revision",
    {nextVersion:3,revisionFiles:[REVISED_PDF]},id);expect(result,403);
  result=await request(IDS.clerk,"resubmit-revision",
    {nextVersion:2,revisionFiles:[{...REVISED_PDF,
      url:"https://other-host.invalid/fake.pdf"}]},id);expect(result,400);
  result=await request(IDS.clerk,"resubmit-revision",
    {nextVersion:2,revisionFiles:[REVISED_PDF]},id);expect(result,200);
  stored=(await get(id)).data();
  assert.equal(stored.activeFileVersion,2);
  assert.equal(stored.fileVersions.length,2);
  assert.equal(stored.fileVersions[1].files[0].driveId,REVISED_PDF.driveId);
  result=await request(IDS.deputy,"deputy-review",{},id);expect(result,200);
  result=await request(IDS.director,"director-publish",
    {recipientIds:[IDS.teacher]},id);expect(result,200);
  result=await request(IDS.teacher,"director-route",
    {targetGroup:ADMIN_GROUP,recipientIds:[IDS.outsider]},id);expect(result,403);
  result=await request(IDS.director,"director-route",
    {targetGroup:ADMIN_GROUP,recipientIds:[IDS.outsider]},id);expect(result,200);
  stored=(await get(id)).data();
  assert.equal(stored.routingEntries.length,1);
  assert.ok(stored.recipientIds.includes(IDS.outsider));

  result=await request(IDS.headSubject,"head-forward",
    {targetGroup:ADMIN_GROUP,recipientIds:[IDS.outsider]},id);expect(result,403);
  result=await request(IDS.headAdmin,"head-forward",
    {targetGroup:ADMIN_GROUP,recipientIds:[IDS.outsider]},id);expect(result,200);
  stored=(await get(id)).data();
  assert.equal(stored.headActions.length,1);
  const headId=stored.headActions[0].id;
  result=await request(IDS.outsider,"acknowledge-assignment",
    {assignmentEventId:headId},id);expect(result,200);
  result=await request(IDS.outsider,"acknowledge-assignment",
    {assignmentEventId:headId},id);expect(result,403);

  // Acting-head reassignment and revoked previous assignment.
  result=await request(IDS.acting,"head-forward",
    {targetGroup:ADMIN_GROUP,recipientIds:[IDS.teacher],reassign:true},id);
  expect(result,200);
  stored=(await get(id)).data();
  assert.equal(stored.headActions.at(-1).supersedes,headId);
  result=await request(IDS.outsider,"acknowledge-assignment",
    {assignmentEventId:headId},id);expect(result,403);

  // Teacher can acknowledge only their own document once.
  result=await request(IDS.teacher,"acknowledge-document",{},id);expect(result,200);
  result=await request(IDS.teacher,"acknowledge-document",{},id);expect(result,409);
  result=await request(IDS.deputy,"acknowledge-document",{},id);expect(result,403);
  const receipt=await col("bhs_documents").doc(id).collection("receipts").doc(IDS.teacher).get();
  assert.equal(receipt.exists,true);
  assert.equal(receipt.data().uid,IDS.teacher);

  // Subject head broadcast is announcement only, not individual assignment.
  result=await request(IDS.headSubject,"head-forward",
    {targetGroup:SUBJECT_GROUP,broadcastAllTeachers:true,recipientIds:[]},
    DOC_IDS.subject);
  expect(result,200);
  const broadcast=(await get(DOC_IDS.subject)).data();
  assert.ok(broadcast.recipientIds.includes(IDS.outsider));
  assert.equal(broadcast.headActions.at(-1).userIds.length,0);
  assert.equal(broadcast.assignedUserIds.includes(IDS.outsider),false);

  // A denied command must have no audit log or document side effects.
  const before=await auditCount();
  const blocked=await request(IDS.teacher,"director-publish",
    {recipientIds:[IDS.outsider]},DOC_IDS.incoming);
  expect(blocked,403);
  assert.equal(await auditCount(),before);

  // HTTP boundary rejects a bearer-free caller and cross-site Origin.
  const missing=await fetch(url,{method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"deputy-review",docId:DOC_IDS.incoming})});
  assert.equal(missing.status,401);
  const crossOrigin=await fetch(url,{method:"POST",
    headers:{"Content-Type":"application/json",
      "Authorization":"Bearer "+tokens(IDS.deputy),
      "Origin":"https://attacker.example"},
    body:JSON.stringify({action:"deputy-review",docId:DOC_IDS.incoming})});
  assert.equal(crossOrigin.status,403);
  // Fake token verifier must reject signature-less strings.
  const fake=await fetch(url,{method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer forged"},
    body:JSON.stringify({action:"deputy-review",docId:DOC_IDS.incoming})});
  assert.equal(fake.status,401);

  assert.ok((await auditCount())>=12);
  console.log("BHS emulator-only HTTP backend: "+count+
    " command requests, auth/role/atomic audit/PDF check/4-stage workflow passed");
}finally{
  if(server.listening)await new Promise(resolve=>server.close(resolve));
  await deleteApp(app);
}
