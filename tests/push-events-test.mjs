import assert from "node:assert/strict";
import {
  serverNotificationEvent,clientNotificationCandidates
} from "../shared/pushEvents.js";
const NOW=Date.now();
const users=[
  {id:"ADMIN",role:"admin",status:"active",adminDept:"-"},
  {id:"DIRECTOR",role:"director",status:"active",adminDept:"-"},
  {id:"DEPUTY",role:"deputy",status:"active",adminDept:"-"},
  {id:"TEACHER_A",role:"teacher",status:"active",adminDept:"Science"},
  {id:"TEACHER_B",role:"teacher",status:"active",adminDept:"Math"},
  {id:"HEAD",role:"teacher",status:"active",adminDept:"Science"},
  {id:"DISABLED",role:"teacher",status:"inactive",adminDept:"Science"}
];
const user=id=>users.find(u=>u.id===id);
const settings={adminHeads:{"Science":"HEAD"},subjectHeads:{}};
const doc=(status,rest={})=>({
  id:"TEST_DOC_123",type:"หนังสือเข้า",createdBy:"TEACHER_A",
  status,createdAt:NOW-9000,subject:"PRIVATE SUBJECT MUST NOT PUSH",
  isDeleted:false,acknowledgedBy:[],
  ...rest
});
const emit=(d,actor,kind,eventId)=>serverNotificationEvent({
  doc:d,actor:user(actor),kind,eventId,users,settings,now:NOW
});
let e=emit(doc("รอรองผู้อำนวยการ"),"TEACHER_A","created");
assert.ok(e);
assert.deepEqual(e.recipientIds.sort(),["ADMIN","DEPUTY"]);
assert.ok(!JSON.stringify(e).includes("PRIVATE SUBJECT"));
assert.equal(emit(doc("รอรองผู้อำนวยการ"),"TEACHER_B","created"),null);
assert.equal(emit(doc("รอรองผู้อำนวยการ",{
  createdAt:NOW-4*60000
}),"TEACHER_A","created"),null);
assert.equal(emit(doc("รอรองผู้อำนวยการ",{
  isDeleted:true
}),"TEACHER_A","created"),null);

const toDirector=doc("รอผู้อำนวยการ",{history:[
  {action:"เสนอผู้อำนวยการ",by:"DEPUTY",timestamp:NOW-1500}
]});
e=emit(toDirector,"DEPUTY","director");
assert.deepEqual(e.recipientIds.sort(),["ADMIN","DIRECTOR"]);
assert.equal(emit(toDirector,"TEACHER_A","director"),null);
const returned=doc("ส่งกลับแก้ไข",{history:[
  {action:"ส่งกลับแก้ไข",by:"DEPUTY",timestamp:NOW-5000}
]});
e=emit(returned,"DEPUTY","returned");
assert.deepEqual(e.recipientIds,["TEACHER_A"]);

const published=doc("เผยแพร่แล้ว",{
  recipientsSnapshot:[{id:"TEACHER_A"},{id:"TEACHER_B"},{id:"DISABLED"}],
  assignedTo:"Science",
  history:[{action:"อนุมัติและเผยแพร่",by:"DIRECTOR",
    timestamp:NOW-1500}]
});
e=emit(published,"DIRECTOR","published");
assert.ok(e.recipientIds.includes("TEACHER_A"));
assert.ok(e.recipientIds.includes("TEACHER_B"));
assert.ok(e.recipientIds.includes("HEAD"));
assert.ok(!e.recipientIds.includes("DISABLED"));
assert.equal(emit(published,"DEPUTY","published"),null);

const routed=doc("อนุมัติ/สั่งการแล้ว",{
  assignedTo:"Science",routingEntries:[{
    id:"EVENT_DIRECTOR_1",by:"DIRECTOR",at:NOW-1200,
    groups:["Science"],userIds:["TEACHER_B"],all:false
  }]
});
e=emit(routed,"DIRECTOR","route","EVENT_DIRECTOR_1");
assert.ok(e.recipientIds.includes("HEAD"));
assert.ok(e.recipientIds.includes("TEACHER_B"));
assert.equal(emit(routed,"DEPUTY","route","EVENT_DIRECTOR_1"),null);
assert.equal(emit(routed,"DIRECTOR","route","NONEXISTENT"),null);

const headed=doc("เผยแพร่แล้ว",{
  assignedTo:"Science",
  headActions:[{
    id:"HEAD_EVENT_1",by:"HEAD",group:"Science",at:NOW-1000,
    userIds:["TEACHER_B"],message:"มอบหมาย"
  }]
});
e=emit(headed,"HEAD","head","HEAD_EVENT_1");
assert.deepEqual(e.recipientIds,["TEACHER_B"]);
assert.equal(emit(headed,"TEACHER_A","head","HEAD_EVENT_1"),null);

assert.deepEqual(
  clientNotificationCandidates([doc("รอรองผู้อำนวยการ")],user("TEACHER_A"),NOW),
  [{docId:"TEST_DOC_123",kind:"created"}]
);
assert.deepEqual(
  clientNotificationCandidates([toDirector],user("DEPUTY"),NOW),
  [{docId:"TEST_DOC_123",kind:"director"}]
);
assert.deepEqual(
  clientNotificationCandidates([routed],user("DIRECTOR"),NOW),
  [{docId:"TEST_DOC_123",kind:"route",eventId:"EVENT_DIRECTOR_1"}]
);
console.log("PASS: BHS Web Push roles, recent server events, owner-only dispatch and audience targeting");
