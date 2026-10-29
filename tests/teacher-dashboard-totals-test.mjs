import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {countDocumentTypes} from "../src/dashboardDocumentCounts.js";
const records=[
  {type:"หนังสือเข้า",status:"เผยแพร่แล้ว",acknowledgedBy:["U01"]},
  {type:"หนังสือเข้า",status:"อนุมัติ/สั่งการแล้ว",acknowledgedBy:[]},
  {type:"หนังสือเวียนแจ้งรับทราบ",status:"เผยแพร่แล้ว",acknowledgedBy:["U01"]},
  {type:"คำสั่งโรงเรียน",status:"เผยแพร่แล้ว",acknowledgedBy:["U01"]},
  {type:"คำสั่งโรงเรียน",status:"รอผู้อำนวยการ",createdBy:"U01"},
  {type:"คำสั่งโรงเรียน",isDeleted:true},
  {type:"อื่นๆ"},
];
assert.deepEqual(countDocumentTypes(records),{incoming:2,circulars:1,orders:2},
  "Count accessible documents regardless of whether already acknowledged");
assert.deepEqual(countDocumentTypes([]),{incoming:0,circulars:0,orders:0});
const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
const beginning=app.indexOf("const cards=teacher?[");
const end=app.indexOf("]:reader?[",beginning);
assert.ok(beginning>0&&end>beginning,"Teachers must have a distinct dashboard layout");
const teacherCards=app.slice(beginning,end);
for(const name of ["หนังสือเข้า","หนังสือเวียน","คำสั่งโรงเรียน","งานที่ได้รับมอบหมาย"]) {
  assert.ok(teacherCards.includes('label:"'+name+'"'),name+" card missing");
}
assert.ok(!teacherCards.includes("รอรับทราบ"),"Teacher card titles must not say pending");
assert.ok(!teacherCards.includes('id:"routing"'),"Head routing does not displace Orders card");
assert.ok(teacherCards.includes("teacherTotals.incoming"));
assert.ok(teacherCards.includes("teacherTotals.circulars"));
assert.ok(teacherCards.includes("teacherTotals.orders"));
assert.ok(teacherCards.includes('id:"assignments"'),"Assignment card preserved");
assert.ok(app.includes('headCount=documents.reduce'),"Existing head workflow untouched");
assert.ok(app.includes("shouldShowRoleMenu(m.id,currentUser.role,managedGroups.length>0)"),"Head navigation untouched");
console.log("Teacher dashboard document totals and menu preservation passed");
