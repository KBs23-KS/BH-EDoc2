import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {incomingUnreadCount,recentIncomingAcknowledgement,validBadgeCount}
  from "../shared/incomingBadge.js";

const teacher={id:"T1",role:"teacher",status:"active",adminDept:"Science"};
const other={id:"T2",role:"teacher",status:"active",adminDept:"Math"};
const clerk={id:"C1",role:"clerk",status:"active",adminDept:"Science"};
const now=Date.now();
const doc=(id,rest={})=>({
  id,type:"หนังสือเข้า",status:"เผยแพร่แล้ว",
  recipientsSnapshot:[{id:"T1"},{id:"C1"}],acknowledgedBy:[],...rest
});
const five=Array.from({length:5},(_,i)=>doc("inc-"+i));
const ignored=[
  doc("order",{type:"คำสั่งโรงเรียน"}),
  doc("circular",{type:"หนังสือเวียนแจ้งรับทราบ"}),
  doc("pending",{status:"รอรองผู้อำนวยการ"}),
  doc("removed",{isDeleted:true}),
  doc("acknowledged",{acknowledgedBy:["T1"]}),
  doc("not-addressed",{recipientsSnapshot:[{id:"T2"}]}),
  doc("snapshot-empty",{recipientsSnapshot:[],assignedTo:"ทุกคน"}),
  doc("wrong-group",{recipientsSnapshot:null,assignedTo:"Math"})
];
assert.equal(incomingUnreadCount([...five,...ignored],teacher),5);
assert.equal(incomingUnreadCount([...five,...ignored],other),2,
  "other teacher sees own snapshot + legacy assigned group");
assert.equal(incomingUnreadCount([...five,...ignored],clerk),6);
assert.equal(incomingUnreadCount([...five,...ignored],{...teacher,status:"inactive"}),0);
assert.equal(incomingUnreadCount([...five,...ignored],{...teacher,role:"admin"}),0);
assert.equal(incomingUnreadCount(null,teacher),0);
const legacy=doc("legacy",{recipientsSnapshot:null,assignedTo:"ทุกคน"});
assert.equal(incomingUnreadCount([legacy],teacher),1);
assert.equal(incomingUnreadCount([legacy],other),1);
let docs=[...five,...ignored];
docs=docs.map(d=>d.id==="inc-0"?{...d,acknowledgedBy:["T1"]}:d);
assert.equal(incomingUnreadCount(docs,teacher),4,"5 to 4 after first receipt");
docs=docs.map(d=>d.id.startsWith("inc-")?{...d,acknowledgedBy:["T1"]}:d);
assert.equal(incomingUnreadCount(docs,teacher),0,"all 5 received: badge is zero");
const ack=doc("inc-0",{acknowledgedBy:["T1"],acknowledgedAt:{T1:now-1000}});
assert.equal(recentIncomingAcknowledgement(ack,teacher,now),true);
assert.equal(recentIncomingAcknowledgement(ack,other,now),false);
assert.equal(recentIncomingAcknowledgement({
  ...ack,recipientsSnapshot:[{id:"T2"}]
},teacher,now),false);
assert.equal(recentIncomingAcknowledgement({
  ...ack,acknowledgedAt:{T1:now-200000}
},teacher,now),false);
assert.equal(recentIncomingAcknowledgement({
  ...ack,type:"คำสั่งโรงเรียน"
},teacher,now),false);
assert.equal(recentIncomingAcknowledgement({
  ...ack,acknowledgedBy:[]
},teacher,now),false);
assert.equal(validBadgeCount(0),true);
assert.equal(validBadgeCount(5),true);
assert.equal(validBadgeCount(-1),false);
assert.equal(validBadgeCount("5"),false);
assert.equal(validBadgeCount(1000000),false);

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sw=read("public/sw.js"),api=read("api/push-badge.js");
const server=read("api/_webPushServer.js"),app=read("src/App.jsx");
const routing=read("src/routingActions.js"),dispatch=read("api/push-dispatch.js");
assert.ok(sw.includes("Number.isSafeInteger(data.badgeCount)"));
assert.ok(sw.includes("self.navigator.clearAppBadge"));
assert.ok(!sw.includes("setAppBadge(1)"),"no false 1 badge when app is closed");
assert.ok(server.includes("incomingUnreadCount(docs,user)"));
assert.ok(server.includes("recentIncomingAcknowledgement(document,user)"));
assert.ok(server.includes("badgeCount:count"));
assert.ok(server.includes("sendRecipient(db,user.id"),"ACK sync only to own devices");
assert.ok(server.includes('where("type","==","หนังสือเข้า")'));
assert.ok(api.includes("verifiedPushUser(req)"));
assert.ok(!api.includes("data.userId"),"no client-supplied user ID");
assert.ok(api.includes('Object.keys(data).some(k=>k!=="docId")'));
assert.ok(app.includes("pendingIconBadge=incomingUnreadCount(activeDocs,currentUser)"));
assert.ok(app.includes("notifyBadgeAfterAcknowledge(docId)"));
assert.ok(routing.includes("onAcknowledgement(d.id)"));
assert.ok(dispatch.includes("pushSchoolEvent(event,users)"));
console.log("PASS: exact incoming PWA badges 5 -> 4 -> 0, isolation, authorization, multi-device ACK updates");
