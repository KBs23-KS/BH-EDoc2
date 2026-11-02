import assert from 'node:assert/strict';
import {isRoutingEligibleDoc,pendingHeadGroups,pendingAssignmentEvents,routingAlerts} from '../src/routing.js';
import {recipientSnapshot,recipientsOf,isRecipient,matchingDocs,pendingAgeDays,sortUrgency,canReadDoc,docYear} from '../src/workflow.js';
const users=[{id:'a',name:'A',role:'teacher',status:'active',adminDept:'science'}, {id:'b',name:'B',role:'teacher',status:'active',adminDept:'math'}];
const order={id:'1',type:'คำสั่งโรงเรียน',status:'เผยแพร่แล้ว',date:'2026-01-04',createdBy:'z',assignedTo:'science'};
const snap=recipientSnapshot(order,users);
assert.deepEqual(snap.map(x=>x.id),['a']);
const withSnap={...order,recipientsSnapshot:snap};
assert.equal(isRecipient(withSnap,users[0],[]),true);
assert.equal(isRecipient(withSnap,users[1],users),false);
assert.equal(canReadDoc(users[0],withSnap),true);
assert.equal(canReadDoc(users[1],withSnap),false);
assert.equal(docYear(order),2569);
assert.equal(matchingDocs([order],{year:2569}).length,1);
assert.equal(matchingDocs([order],{year:2568}).length,0);
assert.equal(sortUrgency([{urgency:'ปกติ'},{urgency:'ด่วนที่สุด'}])[0].urgency,'ด่วนที่สุด');
assert.equal(pendingAgeDays({status:'รอผู้อำนวยการ',sentToDirectorAt:1000},86400000+1000),1);
console.log('workflow tests passed');


const readyIncoming={id:"inc",type:"หนังสือเข้า",status:"อนุมัติ/สั่งการแล้ว",assignedTo:"science",
  routingEntries:[{id:"entry",groups:["science"],userIds:["a"],kind:"director",at:1000}]};
const readyOrder={...readyIncoming,id:"ord",type:"คำสั่งโรงเรียน",status:"เผยแพร่แล้ว"};
const readyCircular={...readyIncoming,id:"circ",type:"หนังสือเวียนแจ้งรับทราบ",status:"เผยแพร่แล้ว"};
const head={id:"a",role:"teacher",adminDept:"science",subjectArea:"science",status:"active"};
const settings={adminHeads:{"science":"a"},subjectHeads:{}};
assert.equal(isRoutingEligibleDoc(readyIncoming),true);
assert.equal(isRoutingEligibleDoc(readyOrder),false);
assert.equal(isRoutingEligibleDoc(readyCircular),false);
assert.equal(isRoutingEligibleDoc({...readyIncoming,isDeleted:true}),false);
assert.equal(isRoutingEligibleDoc({...readyIncoming,status:"รอผู้อำนวยการ"}),false);
assert.equal(pendingHeadGroups(readyIncoming,head,settings).length,1);
assert.equal(pendingHeadGroups(readyOrder,head,settings).length,0);
assert.equal(pendingHeadGroups(readyCircular,head,settings).length,0);
assert.equal(pendingAssignmentEvents(readyIncoming,head).length,1);
assert.equal(pendingAssignmentEvents(readyOrder,head).length,0);
assert.equal(routingAlerts([readyIncoming,readyOrder,readyCircular],head,settings).some(x=>x.docId!=="inc"),false);
console.log("Incoming-only routing and legacy order/circular publication separation passed");
