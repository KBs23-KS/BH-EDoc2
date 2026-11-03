import assert from "node:assert/strict";
import {PUSH_EVENTS,pushEventMetadata,pushRecipientIds} from "../shared/pushPolicy.js";

const users=[
  {id:"t1",role:"teacher",adminDept:"บริหารวิชาการ",status:"active"},
  {id:"t2",role:"teacher",subjectArea:"คณิตศาสตร์",status:"active"},
  {id:"t3",role:"teacher",status:"inactive"},
  {id:"clerk",role:"clerk",status:"active"},
  {id:"dep",role:"deputy",status:"active"},
  {id:"dir",role:"director",status:"active"},
  {id:"admin",role:"admin",status:"active"}
];
const base={id:"DOC-1",type:"หนังสือเข้า",createdBy:"t1",history:[]};
const doc=(status,action,by,extra={})=>({
  ...base,status,...extra,history:[{action,by,timestamp:1700000000000}]
});
const equalIds=(actual,expected)=>assert.deepEqual(actual.sort(),expected.sort());

assert.equal(Boolean(PUSH_EVENTS.created),true);
const created=doc("รอรองผู้อำนวยการ","ลงทะเบียนเอกสาร / สร้างเรื่อง","t1");
assert.ok(pushEventMetadata("created",created,"t1"));
assert.equal(pushEventMetadata("created",created,"t2"),null);
equalIds(pushRecipientIds("created",created,users),["dep","admin"]);

const forwarded=doc("รอผู้อำนวยการ","เสนอผู้อำนวยการ","dep");
assert.ok(pushEventMetadata("forwarded",forwarded,"dep"));
equalIds(pushRecipientIds("forwarded",forwarded,users),["dir","admin"]);

const returned=doc("ส่งกลับแก้ไข","ส่งกลับแก้ไข","dir");
assert.ok(pushEventMetadata("returned",returned,"dir"));
equalIds(pushRecipientIds("returned",returned,users),["t1"]);
assert.equal(pushEventMetadata("returned",{...returned,isDeleted:true},"dir"),null);

const revised=doc("รอรองผู้อำนวยการ","แก้ไขและส่งเรื่องใหม่","t1");
assert.ok(pushEventMetadata("resubmitted",revised,"t1"));

const published=doc("เผยแพร่แล้ว","อนุมัติและเผยแพร่","dir",{
  recipientsSnapshot:[{id:"t2"},{id:"t3"}]});
assert.ok(pushEventMetadata("published",published,"dir"));
equalIds(pushRecipientIds("published",published,users),["t2"]);
assert.equal(pushEventMetadata("published",{...published,status:"รอรองผู้อำนวยการ"},"dir"),null);

const routed=doc("อนุมัติ/สั่งการแล้ว","ผอ. เกษียณหนังสือ","dir",{
  routingEntries:[{groups:["บริหารวิชาการ"],userIds:["t2"],all:false}]});
assert.ok(pushEventMetadata("routed",routed,"dir"));
equalIds(pushRecipientIds("routed",routed,users),["t1","t2"]);

const head=doc("อนุมัติ/สั่งการแล้ว","หัวหน้าเกษียณต่อ","t1",{
  headActions:[{userIds:["t2","t3"]}]});
assert.ok(pushEventMetadata("head_routed",head,"t1"));
equalIds(pushRecipientIds("head_routed",head,users),["t2"]);
assert.equal(pushEventMetadata("head_routed",{...head,status:"ส่งกลับแก้ไข"},"t1"),null);

assert.equal(pushEventMetadata("bogus",created,"t1"),null);
assert.equal(pushEventMetadata("created",{...created,history:[]},"t1"),null);
assert.equal(pushEventMetadata("created",{...created,history:[{action:"ลงทะเบียนเอกสาร / สร้างเรื่อง",by:"t1",timestamp:0}]},"t1"),null);
console.log("Push notification recipient/event safety tests passed");
