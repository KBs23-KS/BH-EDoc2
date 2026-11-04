/**
 * Firestore Emulator ONLY. All accounts, documents and PDFs are fictitious.
 * Simulated backend writes use withSecurityRulesDisabled only AFTER the
 * standalone test policy authorizes the action. This is NOT a live backend.
 */
import assert from "node:assert/strict";
import {initializeTestEnvironment,assertFails,assertSucceeds} from "@firebase/rules-unit-testing";
import {readFileSync} from "node:fs";
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp} from "firebase/firestore";
import {IDS,USERS,SETTINGS,ADMIN_GROUP,SUBJECT_GROUP,DOC_IDS,FAKE_PDF,REVISED_PDF,documentFixture,startingDocuments} from "./fixtures/bhs-realistic-synthetic.mjs";
import {mayPerform,LIVE_STATES} from "../security-test/realisticWorkflowPolicy.mjs";

if(!["127.0.0.1:8099","localhost:8099"].includes(process.env.FIRESTORE_EMULATOR_HOST))
  throw new Error("Emulator port 8099 required; refuse any network Firebase project");
const RULES=readFileSync(new URL("../security/firestore-bhs-realistic-emulator.rules",import.meta.url),"utf8");
if(!RULES.includes("NEVER deploy to bhs-edoc-2"))throw new Error("Safety marker missing");
const env=await initializeTestEnvironment({
  projectId:"demo-bhs-realistic-only",
  firestore:{host:"127.0.0.1",port:8099,rules:RULES}
});
const PATH=["artifacts","bhs-edoc-app","public","data"];
const ref=(db,name,id)=>doc(db,...PATH,name,id);
const receipt=(db,id,uid)=>doc(ref(db,"bhs_documents",id),"receipts",uid);
const paper=(db,id)=>ref(db,"bhs_documents",id);
const actor=id=>USERS.find(u=>u.id===id);
const authDb=(uid,claims={bhsSchoolIdentity:true})=>env.authenticatedContext(uid,claims).firestore();
let operations=0;
async function denied(p){await assertFails(p);operations++;}
async function permitted(p){await assertSucceeds(p);operations++;}
const audit=(action,userId,id)=>({
  action:"TEST: "+action,userId,targetType:"DOCUMENT",targetId:id,
  timestamp:1793764800000,detail:"synthetic authorization only"
});
async function backendGet(id){
  return env.withSecurityRulesDisabled(async ctx=>{
    const result=await getDoc(paper(ctx.firestore(),id));
    return result.exists()?{id,...result.data()}:null;
  });
}
async function backendCreate(actorId,data){
  assert.equal(mayPerform(actor(actorId),"create-incoming",data,{settings:SETTINGS,users:USERS}),true);
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore(),b=writeBatch(db);
    const {id,...rest}=data;
    b.set(paper(db,id),rest);
    b.set(ref(db,"bhs_audit_logs","TEST_AUDIT_CREATE"),audit("create",actorId,id));
    await b.commit();
  });
  operations++;
}
async function backendTransition(actorId,operation,id,changes,opts={}){
  const before=await backendGet(id);
  const identity=actor(actorId);
  const accepted=mayPerform(identity,operation,before,{settings:SETTINGS,users:USERS,...opts});
  assert.equal(accepted,true,"Backend policy must allow "+operation+
    "; actor="+JSON.stringify({id:identity?.id,role:identity?.role,status:identity?.status})+
    "; doc="+JSON.stringify({id:before?.id,type:before?.type,status:before?.status,
      isDeleted:before?.isDeleted,createdBy:before?.createdBy}));
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore(),b=writeBatch(db);
    b.update(paper(db,id),changes);
    b.set(ref(db,"bhs_audit_logs","TEST_AUDIT_"+operation+"_"+operations),
      audit(operation,actorId,id));
    await b.commit();
  });
  operations++;
}
try {
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    for(const u of USERS){const {id,...profile}=u;await setDoc(ref(db,"bhs_users",id),profile);}
    await setDoc(ref(db,"bhs_settings","system"),SETTINGS);
    for(const d of startingDocuments()){
      const {id,...rest}=d;await setDoc(paper(db,id),rest);
    }
    await setDoc(ref(db,"bhs_number_counters","TEST_COUNTER"),{nextNumber:20});
    await setDoc(ref(db,"bhs_audit_logs","TEST_ONLY"),audit("seed",IDS.admin,DOC_IDS.incoming));
    await setDoc(ref(db,"bhs_reminders","TEST_REMINDER"),{uid:IDS.teacher});
  });
  const dbs=Object.fromEntries(Object.entries(IDS).map(([key,id])=>[key,authDb(id)]));
  const {admin,director,deputy,clerk,headAdmin,headSubject,teacher,outsider,acting,inactive}=dbs;
  const anonymous=env.unauthenticatedContext().firestore();
  const noClaim=authDb(IDS.teacher,{}),wrongClaim=authDb(IDS.teacher,{bhsSecurityTest:true});
  const forged=authDb("IMPERSONATOR",{bhsSchoolIdentity:true});

  // Authentication, profile privacy, collection-list denial, audit tampering.
  await denied(getDoc(paper(anonymous,DOC_IDS.routed)));
  await denied(getDoc(paper(noClaim,DOC_IDS.routed)));
  await denied(getDoc(paper(wrongClaim,DOC_IDS.routed)));
  await denied(getDoc(paper(forged,DOC_IDS.routed)));
  await denied(getDoc(paper(inactive,DOC_IDS.routed)));
  await permitted(getDoc(ref(teacher,"bhs_users",IDS.teacher)));
  await denied(getDoc(ref(teacher,"bhs_users",IDS.clerk)));
  await permitted(getDoc(ref(admin,"bhs_users",IDS.clerk)));
  await denied(getDocs(collection(teacher,...PATH,"bhs_users")));
  await denied(getDocs(collection(admin,...PATH,"bhs_users")));
  await permitted(getDoc(ref(teacher,"bhs_settings","system")));
  await denied(updateDoc(ref(admin,"bhs_settings","system"),{schoolName:"forged"}));
  await denied(updateDoc(ref(admin,"bhs_users",IDS.teacher),{role:"admin"}));
  await denied(setDoc(ref(teacher,"bhs_users","TEST_FORGED_001"),{role:"admin"}));
  await denied(getDoc(ref(admin,"bhs_audit_logs","TEST_ONLY")));
  await denied(getDoc(ref(admin,"bhs_number_counters","TEST_COUNTER")));
  await denied(getDoc(ref(admin,"bhs_reminders","TEST_REMINDER")));
  await denied(getDocs(collection(admin,...PATH,"bhs_documents")));
  await denied(getDocs(collection(teacher,...PATH,"bhs_documents")));

  // BHS Thai statuses + group/acting-head and document ownership visibility.
  for(const db of [admin,director,deputy,clerk])await permitted(getDoc(paper(db,DOC_IDS.incoming)));
  for(const db of [teacher,headAdmin,headSubject,outsider,acting])
    await denied(getDoc(paper(db,DOC_IDS.incoming)));
  for(const db of [admin,director,teacher])await permitted(getDoc(paper(db,DOC_IDS.order)));
  for(const db of [deputy,clerk,headAdmin,headSubject,outsider])
    await denied(getDoc(paper(db,DOC_IDS.order)));
  for(const db of [admin,director,headAdmin,acting,teacher,clerk,deputy])
    await permitted(getDoc(paper(db,DOC_IDS.routed)));
  for(const db of [headSubject,outsider])await denied(getDoc(paper(db,DOC_IDS.routed)));
  for(const db of [headSubject,clerk,deputy,admin,director])
    await permitted(getDoc(paper(db,DOC_IDS.subject)));
  for(const db of [headAdmin,acting,teacher,outsider])
    await denied(getDoc(paper(db,DOC_IDS.subject)));
  await permitted(getDoc(paper(teacher,DOC_IDS.returned)));
  await denied(getDoc(paper(outsider,DOC_IDS.returned)));
  await denied(getDoc(paper(deputy,DOC_IDS.returned)));
  await denied(getDoc(paper(admin,DOC_IDS.deleted)));
  await denied(getDoc(paper(teacher,DOC_IDS.deleted)));

  // Direct client writes must fail, even from a logged-in director/admin.
  const newDoc=documentFixture("TEST_DOC_FORGED_HHH");
  await denied(setDoc(paper(clerk,newDoc.id),newDoc));
  await denied(setDoc(paper(admin,newDoc.id),newDoc));
  await denied(updateDoc(paper(director,DOC_IDS.order),{status:LIVE_STATES.published}));
  await denied(updateDoc(paper(director,DOC_IDS.order),{signedFiles:[{name:"fake.pdf"}]}));
  await denied(updateDoc(paper(admin,DOC_IDS.order),{signedFiles:[{name:"fake.pdf"}]}));
  await denied(updateDoc(paper(deputy,DOC_IDS.incoming),{status:LIVE_STATES.director}));
  await denied(updateDoc(paper(headAdmin,DOC_IDS.routed),{headActions:[{group:ADMIN_GROUP}]}));
  await denied(updateDoc(paper(headSubject,DOC_IDS.subject),{headActions:[{group:SUBJECT_GROUP}]}));
  await denied(updateDoc(paper(acting,DOC_IDS.routed),{assignedUserIds:[IDS.outsider]}));
  await denied(updateDoc(paper(teacher,DOC_IDS.returned),{activeFileVersion:99}));
  await denied(updateDoc(paper(teacher,DOC_IDS.routed),{acknowledgedBy:[IDS.teacher]}));
  await denied(updateDoc(paper(admin,DOC_IDS.routed),{recipientIds:[IDS.outsider]}));
  await denied(deleteDoc(paper(admin,DOC_IDS.routed)));
  await denied(setDoc(ref(admin,"bhs_audit_logs","TEST_FORGED"),{role:"director"}));

  // Server-modelled create -> deputy -> return -> revised PDF -> approval.
  const processId="TEST_DOC_PROCESS_HHH";
  await backendCreate(IDS.clerk,documentFixture(processId));
  await denied(getDoc(paper(teacher,processId)));
  await permitted(getDoc(paper(deputy,processId)));
  await backendTransition(IDS.deputy,"deputy-review",processId,{
    status:LIVE_STATES.director,deputyComment:"ทดสอบผ่าน รองฯ"
  });
  await denied(getDoc(paper(deputy,processId)));
  await permitted(getDoc(paper(director,processId)));
  await backendTransition(IDS.director,"return-correction",processId,{
    status:LIVE_STATES.returned,rejectReason:"แก้ไข PDF ฉบับทดสอบ"
  });
  await permitted(getDoc(paper(clerk,processId)));
  await denied(getDoc(paper(teacher,processId)));
  const earlier=await backendGet(processId);
  await backendTransition(IDS.clerk,"resubmit-revision",processId,{
    status:LIVE_STATES.deputy,activeFileVersion:2,files:[REVISED_PDF],
    fileVersions:[...earlier.fileVersions,{
      version:2,files:[REVISED_PDF],timestamp:1793764800002,reason:"ส่งกลับแก้ไข"
    }],signedFiles:[]
  },{nextVersion:2,revisionFiles:[REVISED_PDF]});
  const revised=await backendGet(processId);
  assert.equal(revised.fileVersions.length,2);
  assert.equal(revised.fileVersions[0].files[0].driveId,FAKE_PDF.driveId);
  await backendTransition(IDS.deputy,"deputy-review",processId,{status:LIVE_STATES.director});
  await backendTransition(IDS.director,"director-publish",processId,{
    status:LIVE_STATES.approved,publishedAt:1793764800003,
    recipientIds:[IDS.teacher],
    recipientsSnapshot:[{id:IDS.teacher,name:"ครูจำลอง"}]
  });
  await permitted(getDoc(paper(teacher,processId)));

  // Director routes; appointed head + acting head can read, unrelated head cannot.
  const routeEvent={id:"TEST_ROUTE_PROCESS_01",kind:"director",by:IDS.director,
    groups:[ADMIN_GROUP],userIds:[IDS.teacher],at:1793764800004,message:"ทดสอบมอบหมาย"};
  await backendTransition(IDS.director,"director-route",processId,{
    assignedTo:ADMIN_GROUP,routedGroup:ADMIN_GROUP,
    routingEntries:[routeEvent],assignedUserIds:[IDS.teacher]
  },{targetGroup:ADMIN_GROUP,recipientIds:[IDS.teacher]});
  await permitted(getDoc(paper(headAdmin,processId)));
  await permitted(getDoc(paper(acting,processId)));
  await denied(getDoc(paper(headSubject,processId)));
  const headEvent={id:"TEST_HEAD_PROCESS_01",kind:"head",by:IDS.headAdmin,
    group:ADMIN_GROUP,userIds:[IDS.outsider],at:1793764800005,
    message:"มอบหมายข้ามสาระโดยหัวหน้ากลุ่มงาน"};
  await backendTransition(IDS.headAdmin,"head-forward",processId,{
    headActions:[headEvent],assignedUserIds:[IDS.teacher,IDS.outsider],
    recipientIds:[IDS.teacher,IDS.outsider],
    recipientsSnapshot:[{id:IDS.teacher,name:"ครูจำลอง"},{id:IDS.outsider,name:"ครูนอกกลุ่ม"}]
  },{targetGroup:ADMIN_GROUP,recipientIds:[IDS.outsider]});
  await permitted(getDoc(paper(outsider,processId)));
  await backendTransition(IDS.outsider,"acknowledge-assignment",processId,{
    assignmentAcknowledged:["TEST_HEAD_PROCESS_01::"+IDS.outsider]
  },{assignmentEventId:"TEST_HEAD_PROCESS_01"});
  assert.equal((await backendGet(processId)).assignmentAcknowledged.length,1);

  // The live signing API policy is reused by the test-only server model.
  await backendTransition(IDS.director,"sign-pdf",DOC_IDS.order,{
    status:LIVE_STATES.published,publishedAt:1793764800006,
    signedFiles:[{name:"TEST_SIGNED_ORDER.pdf",driveId:"TEST_FAKE_SIGNED_001",type:"PDF"}],
    recipientIds:[IDS.teacher],recipientsSnapshot:[{id:IDS.teacher,name:"ครูจำลอง"}]
  },{driveId:FAKE_PDF.driveId});
  await permitted(getDoc(paper(teacher,DOC_IDS.order)));
  await denied(updateDoc(paper(director,DOC_IDS.order),{signedFiles:[]}));

  // Create-once acknowledgement, no impersonation and no pending receipts.
  await denied(setDoc(receipt(teacher,DOC_IDS.incoming,IDS.teacher),{
    uid:IDS.teacher,acknowledgedAt:serverTimestamp()
  }));
  await denied(setDoc(receipt(outsider,DOC_IDS.order,IDS.outsider),{
    uid:IDS.outsider,acknowledgedAt:serverTimestamp()
  }));
  await permitted(setDoc(receipt(teacher,DOC_IDS.order,IDS.teacher),{
    uid:IDS.teacher,acknowledgedAt:serverTimestamp()
  }));
  await permitted(getDoc(receipt(teacher,DOC_IDS.order,IDS.teacher)));
  await permitted(getDoc(receipt(admin,DOC_IDS.order,IDS.teacher)));
  await denied(getDoc(receipt(outsider,DOC_IDS.order,IDS.teacher)));
  await denied(setDoc(receipt(teacher,DOC_IDS.order,IDS.teacher),{
    uid:IDS.teacher,acknowledgedAt:serverTimestamp()
  }));
  await denied(setDoc(receipt(teacher,DOC_IDS.order,IDS.clerk),{
    uid:IDS.clerk,acknowledgedAt:serverTimestamp()
  }));
  await denied(setDoc(receipt(admin,DOC_IDS.order,IDS.teacher),{
    uid:IDS.teacher,acknowledgedAt:serverTimestamp()
  }));
  await denied(deleteDoc(receipt(teacher,DOC_IDS.order,IDS.teacher)));
  await permitted(setDoc(receipt(teacher,processId,IDS.teacher),{
    uid:IDS.teacher,acknowledgedAt:serverTimestamp()
  }));
  await permitted(setDoc(receipt(outsider,processId,IDS.outsider),{
    uid:IDS.outsider,acknowledgedAt:serverTimestamp()
  }));
  await denied(getDoc(ref(admin,"bhs_audit_logs","TEST_AUDIT_CREATE")));
  assert.equal((await backendGet(processId)).status,LIVE_STATES.approved);
  console.log("BHS realistic Firestore Emulator: "+operations+
    " role, workflow and denial checks passed on demo-bhs-realistic-only");
}finally{await env.cleanup();}
