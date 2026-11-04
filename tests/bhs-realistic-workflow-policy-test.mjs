/** Offline-only policy checks for synthetic BHS-shaped records. */
import assert from "node:assert/strict";
import {
  IDS,USERS,SETTINGS,ADMIN_GROUP,SUBJECT_GROUP,FAKE_PDF,REVISED_PDF,
  DOC_IDS,startingDocuments,documentFixture
} from "./fixtures/bhs-realistic-synthetic.mjs";
import {mayPerform,LIVE_STATES} from "../security-test/realisticWorkflowPolicy.mjs";
import {canReadDoc} from "../src/workflow.js";
import {canHeadAct,pendingAssignmentEvents,acknowledgedAssignmentEvents} from "../src/routing.js";

const byId=id=>USERS.find(u=>u.id===id);
const docs=startingDocuments(),get=id=>docs.find(d=>d.id===id);
const [admin,director,deputy,clerk,headAdmin,headSubject,teacher,outsider,acting,inactive]=
  [IDS.admin,IDS.director,IDS.deputy,IDS.clerk,IDS.headAdmin,IDS.headSubject,
   IDS.teacher,IDS.outsider,IDS.acting,IDS.inactive].map(byId);
const incoming=get(DOC_IDS.incoming),order=get(DOC_IDS.order),
  routed=get(DOC_IDS.routed),subject=get(DOC_IDS.subject),
  returned=get(DOC_IDS.returned),deleted=get(DOC_IDS.deleted);
let count=0;
const yes=(actor,action,d,opts={})=>{
  assert.equal(mayPerform(actor,action,d,{settings:SETTINGS,users:USERS,...opts}),true,
    actor.id+" should be eligible for "+action);
  count++;
};
const no=(actor,action,d,opts={})=>{
  assert.equal(mayPerform(actor,action,d,{settings:SETTINGS,users:USERS,...opts}),false,
    actor?.id+" should be denied "+action);
  count++;
};
const input=({targetGroup="",recipientIds=[],...opts}={})=>({targetGroup,recipientIds,...opts});
yes(clerk,"create-incoming",incoming);
yes(admin,"create-incoming",documentFixture("TEST_DOC_AUX_ABC",{createdBy:IDS.admin}));
for(const u of [teacher,director,deputy,headAdmin,headSubject,outsider,inactive])
  no(u,"create-incoming",incoming);
yes(deputy,"deputy-review",incoming);
for(const u of [admin,director,clerk,headAdmin,headSubject,teacher,inactive])
  no(u,"deputy-review",incoming);
yes(director,"director-review",order);
yes(admin,"director-review",order);
for(const u of [teacher,clerk,deputy,headSubject,inactive])
  no(u,"director-review",order);
yes(deputy,"return-correction",incoming);
yes(director,"return-correction",order);
for(const u of [teacher,headAdmin,clerk,inactive])
  no(u,"return-correction",incoming);
no(director,"return-correction",incoming);
yes(teacher,"resubmit-revision",returned,{nextVersion:2,revisionFiles:[REVISED_PDF]});
for(const u of [admin,director,clerk,headAdmin,inactive])
  no(u,"resubmit-revision",returned,{nextVersion:2,revisionFiles:[REVISED_PDF]});
no(teacher,"resubmit-revision",returned,{nextVersion:1,revisionFiles:[REVISED_PDF]});
no(teacher,"resubmit-revision",returned,{nextVersion:3,revisionFiles:[REVISED_PDF]});
no(teacher,"resubmit-revision",returned,{nextVersion:2,revisionFiles:[]});
no(teacher,"resubmit-revision",returned,{nextVersion:2,revisionFiles:[REVISED_PDF,FAKE_PDF]});
yes(director,"sign-pdf",order,{driveId:FAKE_PDF.driveId});
yes(admin,"sign-pdf",order,{driveId:FAKE_PDF.driveId});
for(const u of [deputy,clerk,headAdmin,headSubject,teacher,inactive])
  no(u,"sign-pdf",order,{driveId:FAKE_PDF.driveId});
no(director,"sign-pdf",order,{driveId:"TEST_UNKNOWN_DRIVE"});
no(director,"sign-pdf",incoming,{driveId:FAKE_PDF.driveId});
no(director,"sign-pdf",{...order,status:LIVE_STATES.returned},{driveId:FAKE_PDF.driveId});
no(director,"sign-pdf",{...order,isDeleted:true},{driveId:FAKE_PDF.driveId});
yes(director,"director-publish",order);
yes(admin,"director-publish",order);
no(teacher,"director-publish",order);
no(deputy,"director-publish",order);
no(director,"director-publish",returned);
yes(director,"director-route",routed,input({targetGroup:ADMIN_GROUP,recipientIds:[IDS.teacher]}));
yes(admin,"director-route",routed,input({targetGroup:SUBJECT_GROUP,recipientIds:[IDS.headSubject]}));
for(const u of [deputy,clerk,headAdmin,headSubject,teacher,inactive])
  no(u,"director-route",routed,input({targetGroup:ADMIN_GROUP,recipientIds:[IDS.teacher]}));
no(director,"director-route",routed,input({targetGroup:"กลุ่มไม่อยู่ในระบบ",recipientIds:[IDS.teacher]}));
no(director,"director-route",routed,input({targetGroup:ADMIN_GROUP,recipientIds:[IDS.inactive]}));
no(director,"director-route",routed,input({targetGroup:ADMIN_GROUP,recipientIds:[IDS.teacher,IDS.teacher]}));
no(director,"director-route",incoming,input({targetGroup:ADMIN_GROUP,recipientIds:[IDS.teacher]}));
assert.equal(canHeadAct(headAdmin,SETTINGS,ADMIN_GROUP),true);
assert.equal(canHeadAct(acting,SETTINGS,ADMIN_GROUP),true);
assert.equal(canHeadAct(headSubject,SETTINGS,SUBJECT_GROUP),true);
assert.equal(canHeadAct(headSubject,SETTINGS,ADMIN_GROUP),false);
yes(headAdmin,"head-forward",routed,input({targetGroup:ADMIN_GROUP,recipientIds:[IDS.outsider]}));
yes(acting,"head-forward",routed,input({targetGroup:ADMIN_GROUP,recipientIds:[IDS.teacher]}));
yes(headSubject,"head-forward",subject,input({targetGroup:SUBJECT_GROUP,recipientIds:[IDS.teacher]}));
yes(headSubject,"head-forward",subject,input({targetGroup:SUBJECT_GROUP,broadcastAllTeachers:true}));
for(const u of [admin,director,deputy,clerk,teacher,outsider,inactive])
  no(u,"head-forward",routed,input({targetGroup:ADMIN_GROUP,recipientIds:[IDS.teacher]}));
no(headSubject,"head-forward",subject,input({targetGroup:SUBJECT_GROUP,recipientIds:[IDS.outsider]}));
no(headSubject,"head-forward",subject,input({targetGroup:SUBJECT_GROUP,recipientIds:[IDS.inactive]}));
no(headSubject,"head-forward",subject,input({targetGroup:SUBJECT_GROUP,recipientIds:[IDS.teacher],broadcastAllTeachers:true}));
no(headAdmin,"head-forward",subject,input({targetGroup:SUBJECT_GROUP,recipientIds:[IDS.teacher]}));
const actioned={...routed,headActions:[{id:"TEST_HEAD_ACTION_01",group:ADMIN_GROUP,by:IDS.headAdmin,userIds:[IDS.teacher]}]};
no(headAdmin,"head-forward",actioned,input({targetGroup:ADMIN_GROUP,recipientIds:[IDS.teacher]}));
yes(headAdmin,"head-forward",actioned,input({targetGroup:ADMIN_GROUP,recipientIds:[IDS.outsider],reassign:true}));
no(headAdmin,"head-forward",routed,input({targetGroup:ADMIN_GROUP,recipientIds:[IDS.teacher],reassign:true}));
yes(teacher,"acknowledge-document",routed);
yes(headSubject,"acknowledge-document",subject);
no(outsider,"acknowledge-document",routed);
no(deputy,"acknowledge-document",routed);
no(inactive,"acknowledge-document",routed);
no(teacher,"acknowledge-document",incoming);
no(teacher,"acknowledge-document",deleted);
yes(teacher,"acknowledge-assignment",routed,{assignmentEventId:"TEST_ROUTE_001"});
no(outsider,"acknowledge-assignment",routed,{assignmentEventId:"TEST_ROUTE_001"});
no(teacher,"acknowledge-assignment",routed,{assignmentEventId:"TEST_NONEXISTENT"});
const assignmentAcknowledged={...routed,assignmentAcknowledged:["TEST_ROUTE_001::"+IDS.teacher]};
no(teacher,"acknowledge-assignment",assignmentAcknowledged,{assignmentEventId:"TEST_ROUTE_001"});
assert.equal(pendingAssignmentEvents(routed,teacher).length,1);
assert.equal(acknowledgedAssignmentEvents(assignmentAcknowledged,teacher).length,1);
assert.equal(canReadDoc(teacher,routed,USERS),true);
assert.equal(canReadDoc(outsider,routed,USERS),false);
yes(clerk,"soft-delete",incoming);yes(admin,"soft-delete",order);
for(const u of [deputy,director,headAdmin,headSubject,teacher,outsider,inactive])
  no(u,"soft-delete",incoming);
no(clerk,"soft-delete",order);
for(const u of USERS)no(u,"unknown-operation",order);

// Safety: fixture IDs and files are fictional; no real user records are imported.
for(const user of USERS){
  assert.match(user.id,/^TEST_[A-Z0-9_]+$/);
  assert.ok(!("password" in user));
}
for(const d of docs){
  assert.match(d.id,/^TEST_DOC_[A-Z0-9_]+$/);
  assert.ok(d.files.every(f=>f.driveId.startsWith("TEST_FAKE_DRIVE_")&&f.url.startsWith("https://invalid.example/")));
}
console.log("BHS realistic offline policy: "+count+" allow/deny operations passed; all fixtures synthetic");
