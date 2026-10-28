import assert from "node:assert/strict";
import {headGroups,canHeadAct,expandAudience,audienceSnapshot,pendingHeadGroups,pendingAssignmentEvents,routingAlerts,assignmentKey,canViewRouted,routingGroups} from "../src/routing.js";
const users=[
 {id:"a",name:"Admin head",role:"teacher",status:"active",adminDept:"บริหารงานบุคคล",subjectArea:"ภาษาไทย"},
 {id:"b",name:"Acting admin",role:"teacher",status:"active",adminDept:"บริหารงานบุคคล",subjectArea:"ศิลปะ"},
 {id:"c",name:"Subject head",role:"teacher",status:"active",adminDept:"วิชาการ",subjectArea:"คณิตศาสตร์"},
 {id:"d",name:"Teacher another dept",role:"teacher",status:"active",adminDept:"งบประมาณ",subjectArea:"คณิตศาสตร์"},
 {id:"e",name:"Teacher unrelated",role:"teacher",status:"active",adminDept:"วิชาการ",subjectArea:"สังคม"},
 {id:"f",name:"Teacher inactive",role:"teacher",status:"inactive",adminDept:"บริหารงานบุคคล",subjectArea:"ภาษาไทย"}
];
const settings={adminHeads:{"บริหารงานบุคคล":{primary:"a",acting:"b"}},subjectHeads:{"คณิตศาสตร์":{primary:"c"}}};
assert.equal(headGroups(users[0],settings).length,1);
assert.equal(headGroups(users[1],settings).length,1);
assert.equal(canHeadAct(users[2],settings,"บริหารงานบุคคล"),false);
assert.equal(canHeadAct(users[2],settings,"คณิตศาสตร์"),true);
assert.deepEqual(expandAudience({groups:["บริหารงานบุคคล","คณิตศาสตร์"]},users).map(u=>u.id),["a","b","c","d"]);
assert.deepEqual(audienceSnapshot({groups:["คณิตศาสตร์"],users:["c","a"]},users).map(x=>x.id),["a","c","d"]);
const doc={id:"doc-1",status:"อนุมัติ/สั่งการแล้ว",subject:"เรื่องทดสอบ",assignedTo:"หลายกลุ่ม",
 recipientsSnapshot:audienceSnapshot({groups:["บริหารงานบุคคล","คณิตศาสตร์"]},users),
 routingEntries:[{id:"director-1",kind:"director",groups:["บริหารงานบุคคล","คณิตศาสตร์"],userIds:["d"],message:"โปรดดำเนินการ",at:100}],
 headActions:[],assignmentAcknowledged:[]};
assert.deepEqual(routingGroups(doc).sort(),["คณิตศาสตร์","บริหารงานบุคคล"].sort());
assert.deepEqual(pendingHeadGroups(doc,users[0],settings).map(x=>x.group),["บริหารงานบุคคล"]);
assert.deepEqual(pendingHeadGroups(doc,users[2],settings).map(x=>x.group),["คณิตศาสตร์"]);
const allAlerts=routingAlerts([doc],users[2],settings);
assert(allAlerts.some(x=>x.title==="หนังสือรอเกษียณต่อ"));
assert.equal(pendingAssignmentEvents(doc,users[3]).length,1);
assert.equal(canViewRouted(users[3],doc,users),true);
doc.assignmentAcknowledged=[assignmentKey(doc.routingEntries[0],"d")];
assert.equal(pendingAssignmentEvents(doc,users[3]).length,0);
doc.headActions=[{id:"head-a",kind:"head",group:"บริหารงานบุคคล",userIds:["e"],at:200}];
assert.equal(pendingHeadGroups(doc,users[0],settings).length,0);
assert.equal(pendingHeadGroups(doc,users[2],settings).length,1);
assert.equal(canViewRouted(users[4],doc,users),true);
doc.acknowledgedBy=["d"];
assert.equal(pendingAssignmentEvents(doc,users[4]).length,1);
const newHead={id:"new-head",name:"Next head",role:"teacher",status:"active",adminDept:"บริหารงานบุคคล",subjectArea:"ศิลปะ"};
const successorSettings={...settings,adminHeads:{"บริหารงานบุคคล":{primary:"new-head"}}};
assert.equal(canViewRouted(newHead,doc,users,successorSettings),true,"successor head can open old group document");
assert.equal(headGroups(users[0],successorSettings).length,0,"former head loses group-head privileges");
doc.headActions.push({id:"head-b",kind:"head",group:"บริหารงานบุคคล",userIds:["d"],supersedes:"head-a",at:400});
assert.equal(pendingAssignmentEvents(doc,users[4]).length,0,"superseded assignment is not pending");
assert.equal(pendingAssignmentEvents(doc,users[3]).length,1,"new recipient is notified after reassignment");
assert.equal(routingAlerts([doc],users[3],successorSettings).some(x=>x.title==="มีการเปลี่ยนผู้รับมอบหมาย"),true);
console.log("BHS routing and head-transfer rules: passed");
