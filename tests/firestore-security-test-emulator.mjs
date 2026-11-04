/**
 * Runs only within FIRESTORE_EMULATOR_HOST, using synthetic data.
 * Never contacts or deploys a real Firebase project.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {initializeTestEnvironment,assertFails,assertSucceeds} from "@firebase/rules-unit-testing";
import {doc,getDoc,setDoc,updateDoc,serverTimestamp} from "firebase/firestore";

if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8098"&&
   process.env.FIRESTORE_EMULATOR_HOST!=="localhost:8098")
  throw new Error("Refuse to run rules test outside local Firestore Emulator on port 8098");
const rules=readFileSync(new URL("../security/firestore-security-test.rules",import.meta.url),"utf8");
const env=await initializeTestEnvironment({
  projectId:"demo-bhs-security-only",
  firestore:{host:"127.0.0.1",port:8098,rules}
});
const p=(uid,role,status="active")=>({name:"Synthetic "+uid,role,status});
try{
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    for(const [uid,role,status] of [
      ["TEST_ADMIN_001","admin","active"],
      ["TEST_DIRECTOR_001","director","active"],
      ["TEST_DEPUTY_001","deputy","active"],
      ["TEST_CLERK_001","clerk","active"],
      ["TEST_TEACHER_001","teacher","active"],
      ["TEST_HEAD_ADMIN_001","teacher","active"],
      ["TEST_HEAD_SUBJECT_001","teacher","active"],
      ["TEST_DISABLED_001","teacher","inactive"]
    ])await setDoc(doc(db,"bhs_security_test_profiles",uid),p(uid,role,status));
    await setDoc(doc(db,"bhs_security_test_credentials","secret"),{passwordHash:"must-not-be-read"});
    await setDoc(doc(db,"artifacts","bhs-edoc-app","public","data","bhs_users","U1"),{password:"secret"});
    const seed=[
      ["TEST_SHARED_001","approved",["TEST_ADMIN_001","TEST_DIRECTOR_001","TEST_DEPUTY_001","TEST_CLERK_001","TEST_TEACHER_001","TEST_HEAD_ADMIN_001","TEST_HEAD_SUBJECT_001"]],
      ["TEST_PRIVATE_001","approved",["TEST_ADMIN_001","TEST_CLERK_001"]],
      ["TEST_DIRECTOR_PENDING","pending-director",["TEST_ADMIN_001","TEST_DIRECTOR_001"]]
    ];
    for(const [id,status,readerUids] of seed)
      await setDoc(doc(db,"bhs_security_test_documents",id),{
        title:"Synthetic "+id,status,readerUids,createdBy:"TEST_CLERK_001",createdAt:new Date()
      });
  });
  const anonymous=env.unauthenticatedContext().firestore();
  const signed=(uid,claims={bhsSecurityTest:true})=>env.authenticatedContext(uid,claims).firestore();
  const admin=signed("TEST_ADMIN_001"),director=signed("TEST_DIRECTOR_001");
  const teacher=signed("TEST_TEACHER_001"),clerk=signed("TEST_CLERK_001");
  const deputy=signed("TEST_DEPUTY_001"),head=signed("TEST_HEAD_SUBJECT_001");
  await assertFails(getDoc(doc(anonymous,"bhs_security_test_documents","TEST_SHARED_001")));
  await assertFails(getDoc(doc(signed("TEST_TEACHER_001",{}),"bhs_security_test_documents","TEST_SHARED_001")));
  await assertFails(getDoc(doc(signed("TEST_DISABLED_001"),"bhs_security_test_documents","TEST_SHARED_001")));
  await assertFails(getDoc(doc(admin,"bhs_security_test_credentials","secret")));
  await assertFails(getDoc(doc(admin,"artifacts","bhs-edoc-app","public","data","bhs_users","U1")));
  await assertSucceeds(getDoc(doc(teacher,"bhs_security_test_profiles","TEST_TEACHER_001")));
  await assertFails(getDoc(doc(teacher,"bhs_security_test_profiles","TEST_CLERK_001")));
  await assertSucceeds(getDoc(doc(admin,"bhs_security_test_profiles","TEST_TEACHER_001")));
  await assertSucceeds(getDoc(doc(teacher,"bhs_security_test_documents","TEST_SHARED_001")));
  await assertSucceeds(getDoc(doc(head,"bhs_security_test_documents","TEST_SHARED_001")));
  await assertFails(getDoc(doc(teacher,"bhs_security_test_documents","TEST_PRIVATE_001")));
  await assertFails(getDoc(doc(head,"bhs_security_test_documents","TEST_PRIVATE_001")));
  await assertSucceeds(getDoc(doc(director,"bhs_security_test_documents","TEST_PRIVATE_001")));
  await assertSucceeds(getDoc(doc(clerk,"bhs_security_test_documents","TEST_PRIVATE_001")));
  await assertFails(getDoc(doc(deputy,"bhs_security_test_documents","TEST_PRIVATE_001")));
  await assertFails(updateDoc(doc(teacher,"bhs_security_test_documents","TEST_SHARED_001"),{status:"approved-by-teacher"}));
  await assertFails(updateDoc(doc(clerk,"bhs_security_test_documents","TEST_PRIVATE_001"),{status:"approved"}));
  await assertSucceeds(updateDoc(doc(director,"bhs_security_test_documents","TEST_DIRECTOR_PENDING"),{status:"approved"}));
  await assertFails(updateDoc(doc(director,"bhs_security_test_documents","TEST_PRIVATE_001"),{title:"Escalated"}));
  await assertFails(setDoc(doc(teacher,"bhs_security_test_documents","TEST_FORGED"),{title:"forged"}));
  await assertSucceeds(setDoc(doc(clerk,"bhs_security_test_documents","TEST_NEW_001"),{
    title:"Synthetic new",status:"draft",createdBy:"TEST_CLERK_001",
    readerUids:["TEST_CLERK_001"],createdAt:serverTimestamp()
  }));
  await assertFails(setDoc(doc(clerk,"bhs_security_test_documents","TEST_NEW_002"),{
    title:"Synthetic leaked",status:"draft",createdBy:"TEST_CLERK_001",
    readerUids:["TEST_CLERK_001","TEST_TEACHER_001"],createdAt:serverTimestamp()
  }));
  await assertSucceeds(setDoc(doc(teacher,"bhs_security_test_documents","TEST_SHARED_001","receipts","TEST_TEACHER_001"),{
    uid:"TEST_TEACHER_001",acknowledgedAt:serverTimestamp()
  }));
  await assertFails(setDoc(doc(teacher,"bhs_security_test_documents","TEST_SHARED_001","receipts","TEST_CLERK_001"),{
    uid:"TEST_CLERK_001",acknowledgedAt:serverTimestamp()
  }));
  // Four-step browser workflow: clerk draft -> admin forwards -> director approves -> teacher acknowledges.
  const flowId="TEST_FLOW_0123456789AbCdEfGhIj";
  const flowRef=(database)=>doc(database,"bhs_security_test_documents",flowId);
  await assertSucceeds(setDoc(flowRef(clerk),{
    title:"Synthetic end-to-end workflow",status:"draft",
    createdBy:"TEST_CLERK_001",readerUids:["TEST_CLERK_001"],
    createdAt:serverTimestamp()
  }));
  await assertFails(getDoc(flowRef(teacher)));
  await assertFails(setDoc(doc(teacher,"bhs_security_test_documents","TEST_FLOW_UNAUTHORIZED"),{
    title:"Unauthorized",status:"draft",createdBy:"TEST_TEACHER_001",
    readerUids:["TEST_TEACHER_001"],createdAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(flowRef(admin),{
    status:"pending-director",readerUids:["TEST_CLERK_001","TEST_TEACHER_001"]
  }));
  // Even a named recipient cannot read pending items before approval.
  await assertFails(getDoc(flowRef(teacher)));
  await assertSucceeds(getDoc(flowRef(clerk)));
  await assertSucceeds(getDoc(flowRef(director)));
  await assertFails(updateDoc(flowRef(clerk),{status:"approved"}));
  await assertFails(updateDoc(flowRef(teacher),{status:"approved"}));
  await assertFails(setDoc(
    doc(teacher,"bhs_security_test_documents",flowId,"receipts","TEST_TEACHER_001"),
    {uid:"TEST_TEACHER_001",acknowledgedAt:serverTimestamp()}
  ));
  await assertSucceeds(updateDoc(flowRef(director),{status:"approved"}));
  await assertSucceeds(getDoc(flowRef(teacher)));
  await assertSucceeds(setDoc(
    doc(teacher,"bhs_security_test_documents",flowId,"receipts","TEST_TEACHER_001"),
    {uid:"TEST_TEACHER_001",acknowledgedAt:serverTimestamp()}
  ));
  await assertFails(setDoc(
    doc(teacher,"bhs_security_test_documents",flowId,"receipts","TEST_CLERK_001"),
    {uid:"TEST_CLERK_001",acknowledgedAt:serverTimestamp()}
  ));
  await assertFails(setDoc(
    doc(clerk,"bhs_security_test_documents",flowId,"receipts","TEST_TEACHER_001"),
    {uid:"TEST_TEACHER_001",acknowledgedAt:serverTimestamp()}
  ));
  // Receipt create is one-time; overwriting an acknowledged receipt is prohibited.
  await assertFails(setDoc(
    doc(teacher,"bhs_security_test_documents",flowId,"receipts","TEST_TEACHER_001"),
    {uid:"TEST_TEACHER_001",acknowledgedAt:serverTimestamp()}
  ));
  // A recipient assigned by mistake must not acknowledge any pending document.
  await assertSucceeds(updateDoc(flowRef(admin),{status:"pending-director"}));
  await assertFails(getDoc(flowRef(teacher)));
  await assertFails(setDoc(
    doc(teacher,"bhs_security_test_documents",flowId,"receipts","TEST_OTHER_TEACHER"),
    {uid:"TEST_OTHER_TEACHER",acknowledgedAt:serverTimestamp()}
  ));
  await assertSucceeds(updateDoc(flowRef(admin),{status:"approved"}));
  assert.ok(true);
  console.log("Firestore Emulator: all 7 synthetic role/access cases + four-stage workflow and denial tests passed");
}finally{await env.cleanup();}
