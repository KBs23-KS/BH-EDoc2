import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  assignedEvents,pendingAssignmentEvents,acknowledgedAssignmentEvents,
  broadcastTeacherIds,audienceSnapshot,assignmentKey
} from "../src/routing.js";

const teacher={id:"U20",role:"teacher",status:"active"};
const teacher2={id:"U21",role:"teacher",status:"active"};
const inactiveTeacher={id:"U22",role:"teacher",status:"inactive"};
const clerk={id:"U23",role:"clerk",status:"active"};
const deputy={id:"U24",role:"deputy",status:"active"};
const users=[teacher,teacher2,inactiveTeacher,clerk,deputy];

assert.deepEqual(broadcastTeacherIds(users),["U20","U21"],"broadcast reaches only active teacher accounts");
assert.deepEqual(broadcastTeacherIds([]),[]);
const first={id:"rt1",kind:"director",userIds:["U20"],at:10,message:"ปฏิบัติงาน"};
const second={id:"rt2",kind:"head",userIds:["U20"],at:20,message:"ดำเนินการ"};
const doc={
  id:"DOC01",type:"หนังสือเข้า",status:"เผยแพร่แล้ว",isDeleted:false,
  routingEntries:[first],headActions:[second],assignmentAcknowledged:[]
};
assert.equal(pendingAssignmentEvents(doc,teacher).length,2);
assert.equal(acknowledgedAssignmentEvents(doc,teacher).length,0);
assert.equal(pendingAssignmentEvents(doc,teacher2).length,0);

const oneAcked={...doc,assignmentAcknowledged:[assignmentKey(first,teacher.id)]};
assert.deepEqual(pendingAssignmentEvents(oneAcked,teacher).map(e=>e.id),["rt2"]);
assert.deepEqual(acknowledgedAssignmentEvents(oneAcked,teacher).map(e=>e.id),["rt1"]);
const fullyAcked={...oneAcked,assignmentAcknowledged:[assignmentKey(first,teacher.id),assignmentKey(second,teacher.id)]};
assert.equal(pendingAssignmentEvents(fullyAcked,teacher).length,0);
assert.deepEqual(acknowledgedAssignmentEvents(fullyAcked,teacher).map(e=>e.id),["rt2","rt1"]);

const later={id:"rt3",kind:"director",userIds:["U21"],supersedes:"rt1",at:30};
const reassigned={...oneAcked,routingEntries:[first,later]};
assert.deepEqual(pendingAssignmentEvents(reassigned,teacher).map(e=>e.id),["rt2"]);
assert.deepEqual(acknowledgedAssignmentEvents(reassigned,teacher).map(e=>e.id),["rt1"],"historical acknowledgement stays visible after later reassignment");
assert.deepEqual(pendingAssignmentEvents(reassigned,teacher2).map(e=>e.id),["rt3"]);
assert.equal(acknowledgedAssignmentEvents({...doc,isDeleted:true},teacher).length,0);

const broadcastIds=broadcastTeacherIds(users);
const announced=audienceSnapshot({users:broadcastIds},users,[],"head-U1",100);
assert.deepEqual(announced.map(u=>u.id),["U20","U21"]);
assert.ok(announced.every(u=>u.reason==="ผู้รับจากการเกษียณ"));
const infoEvent={id:"rt-broadcast",kind:"head",broadcastAllTeachers:true,group:"กลุ่มบริหารงาน",userIds:[]};
const notice={...doc,headActions:[infoEvent],routingEntries:[],assignmentAcknowledged:[]};
assert.deepEqual(assignedEvents(notice,teacher),[],"broadcast does not create assigned work for teachers");
assert.deepEqual(pendingAssignmentEvents(notice,teacher),[]);
const noSensitiveDoc={...doc,status:"รอผู้อำนวยการ"};
assert.deepEqual(pendingAssignmentEvents(noSensitiveDoc,teacher),[]);
assert.deepEqual(acknowledgedAssignmentEvents(noSensitiveDoc,teacher),[]);

const assignmentUi=readFileSync(new URL("../src/AssignmentsWorkspace.jsx",import.meta.url),"utf8");
const headUi=readFileSync(new URL("../src/RoutingWorkspace.jsx",import.meta.url),"utf8");
const actions=readFileSync(new URL("../src/routingActions.js",import.meta.url),"utf8");
assert.match(assignmentUi,/ยังไม่รับทราบ/);
assert.match(assignmentUi,/รับทราบแล้ว/);
assert.match(assignmentUi,/acknowledgedAssignmentEvents/);
assert.match(headUi,/id:"head-broadcast".*ประชาสัมพันธ์ครูทุกคน/,"Modern head broadcast action card remains available");
assert.match(headUi,/broadcastAllTeachers:choice==="head-broadcast"/,"Broadcast action stays separate from individual assignments");
assert.match(headUi,/aspect-\[210\/297\]/,"PDF viewer uses A4 portrait ratio");
assert.match(headUi,/min-h-\[800px\]/,"PDF viewer is taller on tablets and desktops");
assert.match(actions,/broadcastAllTeachers\?broadcastRecipients:userIds/,"broadcast affects recipients snapshot");
assert.match(actions,/broadcastAllTeachers\?\"หัวหน้าประชาสัมพันธ์ครูทุกคน\"/);
console.log("Assignment tabs, broadcast privacy and A4 preview regression tests passed");
