import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  totalPendingNotifications,recentSchoolAcknowledgement,
  recentAssignmentAcknowledgement,recentHeadAction
} from "../shared/notificationBadge.js";

const now=Date.now();
const teacher={id:"T1",role:"teacher",status:"active",adminDept:"ฝ่ายวิชาการ",subjectArea:"Science"};
const other={id:"T2",role:"teacher",status:"active",adminDept:"Other"};
const deputy={id:"D1",role:"deputy",status:"active"};
const director={id:"P1",role:"director",status:"active"};
const admin={id:"A1",role:"admin",status:"active"};
const users=[teacher,other,deputy,director,admin];
const settings={adminHeads:{"ฝ่ายวิชาการ":{primary:"T1"}}};
const d=(id,type="หนังสือเข้า",extra={})=>({
  id,type,status:"เผยแพร่แล้ว",subject:id,
  createdBy:"A1",assignedTo:"ทีม",
  recipientsSnapshot:[{id:"T1"}],
  acknowledgedBy:[],...extra
});
const unread=[
  ...Array.from({length:5},(_,i)=>d("inc"+i)),
  d("order1","คำสั่งโรงเรียน"),
  d("order2","คำสั่งโรงเรียน"),
  d("circular1","หนังสือเวียนแจ้งรับทราบ"),
  d("circular2","หนังสือเวียนแจ้งรับทราบ"),
  d("circular3","หนังสือเวียนแจ้งรับทราบ")
];
const calc=(docs,user=teacher,reminders=[])=>
  totalPendingNotifications(docs,user,users,{},reminders);
assert.equal(calc(unread),10,"5 incoming + 2 orders + 3 circulars");
assert.equal(calc(unread,other),0,"per-account recipient isolation");
assert.equal(calc(unread,{...teacher,status:"inactive"}),0,"inactive account");
const acknowledged=unread.map(x=>x.id==="inc0"||x.id==="order1"?
  {...x,acknowledgedBy:["T1"]}:x);
assert.equal(calc(acknowledged),8,"acknowledgement decreases all document types");
const allAck=unread.map(x=>({...x,acknowledgedBy:["T1"]}));
assert.equal(calc(allAck),0,"clear when all categories acknowledged");
const receipt=d("order-acked","คำสั่งโรงเรียน",{
  acknowledgedBy:["T1"],acknowledgedAt:{T1:now-1000}
});
assert.equal(recentSchoolAcknowledgement(receipt,teacher,now),true);
assert.equal(recentSchoolAcknowledgement(
  {...receipt,type:"หนังสือเวียนแจ้งรับทราบ"},teacher,now),true);
assert.equal(recentSchoolAcknowledgement(receipt,other,now),false);
assert.equal(recentSchoolAcknowledgement(
  {...receipt,acknowledgedAt:{T1:now-200000}},teacher,now),false);
assert.equal(recentSchoolAcknowledgement(
  {...receipt,type:"คำสั่งที่ไม่รู้จัก"},teacher,now),false);

const reviewDep=d("reviewDep","หนังสือเข้า",{
  status:"รอรองผู้อำนวยการ",createdBy:"T2"
});
const reviewDir=d("reviewDir","หนังสือเข้า",{
  status:"รอผู้อำนวยการ",createdBy:"T2"
});
assert.equal(calc([reviewDep],deputy),1);
assert.equal(calc([reviewDir],director),1);
assert.equal(calc([reviewDep,reviewDir],admin),2);
assert.equal(calc([reviewDep,reviewDir],teacher),0);
const returned=d("returned","หนังสือเข้า",{
  status:"ส่งกลับแก้ไข",createdBy:"T1"
});
assert.equal(calc([returned],teacher),1,"returned-to-author is a bell alert");
assert.equal(calc([returned],other),0);

const route=d("routed","หนังสือเข้า",{
  assignedTo:"ฝ่ายวิชาการ",recipientsSnapshot:[],
  routingEntries:[{id:"route-1",userIds:["T1"],kind:"director",at:now-1000}]
});
assert.equal(totalPendingNotifications([route],teacher,users,settings,[]),2,
  "one pending head action plus one new assignment");
const assignmentDone={...route,assignmentAcknowledged:["route-1::T1"],
  history:[{action:"รับทราบงานที่ได้รับมอบหมาย",by:"T1",timestamp:now-1000}]};
assert.equal(totalPendingNotifications([assignmentDone],teacher,users,settings,[]),1);
assert.equal(recentAssignmentAcknowledgement(assignmentDone,teacher,"route-1",now),true);
assert.equal(recentAssignmentAcknowledgement(assignmentDone,other,"route-1",now),false);
assert.equal(recentAssignmentAcknowledgement({...assignmentDone,history:[]},teacher,"route-1",now),false);
const headCompleted={...assignmentDone,headActions:[
  {id:"head-1",group:"ฝ่ายวิชาการ",by:"T1",at:now-1000,userIds:[]}
]};
assert.equal(totalPendingNotifications([headCompleted],teacher,users,settings,[]),0);
assert.equal(recentHeadAction(headCompleted,teacher,"head-1",settings,now),true);
assert.equal(recentHeadAction(headCompleted,other,"head-1",settings,now),false);

const reminder={id:"rem-1",docId:"circular1",targetUserId:"T1"};
assert.equal(calc([unread[7]],teacher,[reminder]),2,
  "bell counts the circular and separate outstanding reminder");
assert.equal(calc([{...unread[7],acknowledgedBy:["T1"]}],teacher,[reminder]),0,
  "after acknowledgement both circular and reminder disappear");

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const app=read("src/App.jsx"),server=read("api/_webPushServer.js");
const api=read("api/push-badge.js"),dispatch=read("api/push-dispatch.js");
const routing=read("src/routingActions.js");
assert.ok(app.includes("const pendingIconBadge=notifications.length;"));
assert.ok(app.includes('aria-label={`การแจ้งเตือนค้าง ${notifications.length} รายการ`}'));
assert.ok(!app.includes("หนังสือเข้าค้าง 0"));
assert.ok(!app.includes("เซิร์ฟเวอร์ยืนยันว่าผูกอุปกรณ์กับบัญชีนี้แล้ว"));
assert.ok(!app.includes("ตรวจสถานะกับเซิร์ฟเวอร์"));
assert.ok(!app.includes("ส่งทดสอบถึงเครื่องนี้"));
assert.ok(!app.includes("data-testid={executiveWorkRole"));
assert.ok(app.includes('onClick={toggleDevicePush}'));
assert.ok(app.includes('currentPushState()'));
assert.ok(server.includes("totalPendingNotifications(context.documents,user,context.users"));
assert.ok(server.includes("recentSchoolAcknowledgement(doc,user)"));
assert.ok(server.includes("recentAssignmentAcknowledgement(doc,user,eventId)"));
assert.ok(server.includes("recentHeadAction(doc,user,eventId,context.settings)"));
assert.ok(server.includes("badgeCountFromContext(context,user)"));
assert.ok(server.includes("actorBadgeUpdated"));
assert.ok(api.includes("currentNotificationBadge(user)"));
assert.ok(api.includes('["receipt","assignment","head"]'));
assert.ok(dispatch.includes("users,actor.id"));
assert.ok(routing.includes('onAcknowledgement(d.id,"assignment",e.id)'));
assert.ok(routing.includes('onAcknowledgement(d.id,"head",pushedEventId)'));
console.log("PASS: unified all-category badge, 10->8->0, review/return/head/assignment/reminder, secure cross-device updates, clean UI");
