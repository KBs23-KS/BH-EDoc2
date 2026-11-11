import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {headBroadcastSummaries} from "../src/routing.js";

const doc=(headActions=[],extra={})=>({
  id:"book-1",type:"หนังสือเข้า",status:"เผยแพร่แล้ว",
  ...extra,headActions
});
const action=(id,group,at,options={})=>({
  id,kind:"head",group,at,by:"head-user",byName:"ครูผู้รับผิดชอบ",
  message:"แจ้งครูทุกคนรับทราบ",broadcastAllTeachers:true,...options
});

assert.deepEqual(headBroadcastSummaries(doc()),[],"No broadcast => no extra card");
assert.deepEqual(headBroadcastSummaries(doc([action("e1","กลุ่มบริหารวิชาการ",100,{
  broadcastAllTeachers:false
})])),[],"Head acknowledgement or individual assignment is not a public broadcast");
const one=headBroadcastSummaries(doc([action("e1","กลุ่มบริหารวิชาการ",100)]));
assert.equal(one.length,1);
assert.deepEqual(one[0],{
  id:"e1",group:"กลุ่มบริหารวิชาการ",at:100,
  byName:"ครูผู้รับผิดชอบ",message:"แจ้งครูทุกคนรับทราบ"
},"Name, group, comment and time are derived from the saved head action");

const latest=headBroadcastSummaries(doc([
  action("e1","กลุ่มบริหารวิชาการ",100,{message:"ข้อความเดิม"}),
  action("e2","กลุ่มบริหารวิชาการ",200,{message:"ข้อความใหม่",supersedes:"e1"})
]));
assert.deepEqual(latest.map(e=>e.message),["ข้อความใหม่"],
  "Revised head action shows only the most recent message");

assert.deepEqual(headBroadcastSummaries(doc([
  action("e1","กลุ่มบริหารวิชาการ",100),
  action("e2","กลุ่มบริหารวิชาการ",200,{
    supersedes:"e1",broadcastAllTeachers:false,userIds:["T1"]
  })
])),[],"A later individual reassignment supersedes an old public broadcast");

const groups=headBroadcastSummaries(doc([
  action("g1","กลุ่มบริหารวิชาการ",100),
  action("g2","กลุ่มบริหารงานบุคคล",300,{message:"ข้อสั่งการกลุ่มบุคคล"}),
  action("g3","กลุ่มบริหารวิชาการ",200,{message:"ล่าสุดวิชาการ",supersedes:"g1"})
]));
assert.equal(groups.length,2,"Separate head groups create separate cards");
assert.deepEqual(groups.map(x=>x.group),["กลุ่มบริหารงานบุคคล","กลุ่มบริหารวิชาการ"]);
assert.equal(groups[1].message,"ล่าสุดวิชาการ");
assert.equal(headBroadcastSummaries(doc([action("g1","กลุ่มบริหารวิชาการ",100,{message:"  "})]))[0].message,"",
  "A blank head comment yields a safe published status instead of invented text");

assert.deepEqual(headBroadcastSummaries(doc([action("e1","กลุ่มบริหารวิชาการ",100)],{status:"รอผู้อำนวยการ"})),[],
  "Unapproved documents do not show head broadcast summaries");
assert.deepEqual(headBroadcastSummaries(doc([action("e1","กลุ่มบริหารวิชาการ",100)],{type:"คำสั่งโรงเรียน"})),[],
  "Only incoming letters show head broadcast summaries");
assert.deepEqual(headBroadcastSummaries(doc([action("e1","กลุ่มบริหารวิชาการ",100)],{isDeleted:true})),[],
  "Deleted documents do not show public broadcast summaries");

const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
const taskView=app.slice(app.indexOf("function TasksView("),app.indexOf("function AdvancedSearchTable("));
assert.equal(taskView.split("min-h-[30px]").length-1,3,"All task badges compacted from 34px to 30px");
assert.equal(taskView.split("px-2.5 py-1 text-[13px]").length-1,3,"All three task badges use an intermediate font size and padding");
assert.ok(taskView.includes('DOC_STATUS.WAITING_DEPUTY ? "border-sky-300 bg-sky-100 text-sky-900" : "border-amber-300 bg-amber-100 text-amber-900"'),
  "Deputy and director waiting badges use distinct blue and amber colors");
assert.ok(taskView.includes("'bg-red-600'"),"Highest urgency stays red");
const register=app.slice(app.indexOf("function AdvancedSearchTable("));
assert.ok(register.includes('docObj.type === "หนังสือเข้า" ? headBroadcastSummaries(docObj) : []'),
  "Only incoming register entries are eligible for the broadcast card");
assert.ok(register.includes('headBroadcasts.map(head => ('),"An individual card is created per latest broadcasting group");
assert.ok(register.includes("ความเห็นหัวหน้า: {head.group}"));
assert.ok(register.includes("ประชาสัมพันธ์ครูทุกคน"));
assert.ok(register.includes("head.message ?"),"Saved free-text comment shown only when provided");
assert.ok(register.includes("head.byName"),"Show the real acting head name");
assert.ok(register.includes("formatDateTime(head.at)"),"Display the saved action time");
const deputyAt=register.indexOf('{docObj.deputyComment && <div className="bg-blue-50');
const directorAt=register.indexOf('{docObj.directorCommand && <div className="bg-green-50');
const assignedAt=register.indexOf('{docObj.assignedTo && <div className="bg-yellow-50');
const broadcastAt=register.indexOf('{headBroadcasts.map(head => (');
assert.ok(deputyAt>=0&&directorAt>deputyAt&&assignedAt>directorAt&&broadcastAt>assignedAt,
  "Incoming register displays deputy > director > assignment > latest head opinion in workflow order");
console.log("PASS: distinct readable task badges and per-group latest public head comments");
