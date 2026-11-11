import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {headGroups,pendingHeadGroups,directorHeadRoutingProgress} from "../src/routing.js";
import {shouldShowRoleMenu} from "../src/menuVisibility.js";

const source=readFileSync(new URL("../src/RoutingWorkspace.jsx",import.meta.url),"utf8");
const workspace=source.slice(source.indexOf("export function RoutingWorkspace("),source.indexOf("function EventLine("));
const directory=source.slice(source.indexOf("function TeacherDirectoryPicker("),source.indexOf("export function RoutingWorkspace("));

assert.ok(source.includes("export function DocumentDetail("),"Existing detail view remains available");
assert.ok(workspace.includes("onOpen(doc.id)"),"Open existing original incoming document and routing details");
assert.ok(workspace.includes("เปิดดูเอกสารและข้อเกษียณ"),"Correct document detail action");
assert.ok(!workspace.includes("ดูเอกสารฉบับลงนาม"),"Incoming letter is not director-signed");
assert.ok(!workspace.includes("ดูหนังสือต้นฉบับ</button>"),"No duplicate footer document button");

assert.equal(shouldShowRoleMenu("routing","director",false),false,
  "The director routing sidebar menu remains hidden");
assert.equal(shouldShowRoleMenu("tasks","director",false),true,
  "The director's primary งานที่ต้องดำเนินการ stays visible");
assert.equal(shouldShowRoleMenu("routing","admin",false),true,
  "Admin routing menu remains available");
assert.equal(shouldShowRoleMenu("routing","teacher",true),true,
  "Head menu remains available");
assert.ok(workspace.includes('const canDirector=["director","admin"].includes(currentUser.role)'),
  "Role-specific actions are retained in the single modern screen");
assert.ok(!source.includes("LegacyDirectorRoutingWorkspace"),
  "Director/admin do not open a legacy screen anymore");
assert.ok(workspace.includes('data-testid="modern-routing-workspace"'));
assert.ok(workspace.includes("lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"));
assert.ok(workspace.includes("ค้นหาเลขรับหรือชื่อเรื่อง"));
assert.ok(workspace.includes("activeHeadRows=headTab"));
assert.ok(workspace.includes('switchHeadTab("pending")'));
assert.ok(workspace.includes('switchHeadTab("completed")'));
assert.ok(workspace.includes("myGroup.length===1?myGroup[0].group:\"\""),
  "Automatic group selection only when one eligible group");
assert.ok(workspace.includes("setActiveGroup(e.target.value)"));

for (const mode of [
  '"head-ack"','"head-teachers"','"head-broadcast"',
  '"director-groups"','"director-teachers"','"director-all"'
]) assert.ok(workspace.includes(mode),"Missing action "+mode);
assert.ok(workspace.includes("choice===action.id"));
assert.ok(workspace.includes("if(!confirm){setConfirm(true);return;}"));
assert.ok(workspace.includes("await onHeadAction(doc,"),"Existing authorization for heads");
assert.ok(workspace.includes("await onRoute(doc,"),"Existing director/admin authorized routing");
assert.ok(workspace.includes("setGroups([]);setIds([]);setAll(next===\"director-all\")"),
  "Switching director action clears recipients hidden in the other mode");
assert.ok(workspace.includes("reassign:!!completed"));
assert.ok(workspace.includes("disabled={unableToSave}"));

assert.ok(directory.includes('label:"กลุ่มงาน"'));
assert.ok(directory.includes('label:"กลุ่มสาระฯ"'));
assert.ok(directory.includes('label:"รายชื่อทั้งหมด"'));
assert.ok(directory.includes('!restrictedSubject||u.subjectArea===restrictedSubject'),
  "Subject heads cannot see teachers outside eligible subject");
assert.ok(directory.includes('mode==="all"?eligible'),
  "All directory mode does not auto-assign everyone");
assert.ok(directory.includes('allDisplayedSelected?"ยกเลิกที่แสดง":"เลือกทั้งหมดที่แสดง"'),
  "Explicit selection required");
assert.ok(directory.includes("new Set([...selected,...displayedIds])"),
  "Changing scope keeps intentionally selected names");
assert.ok(directory.includes("selected.includes(u.id)"));

const person={id:"H",role:"teacher",status:"active",adminDept:"กลุ่มบริหารงานบุคคล",subjectArea:"ภาษาไทย"};
const settings={
  adminHeads:{"กลุ่มบริหารงานบุคคล":{primary:"H"}},
  subjectHeads:{"ภาษาไทย":{primary:"H"}}
};
const book={type:"หนังสือเข้า",status:"เผยแพร่แล้ว",assignedTo:"-",
  routingEntries:[{id:"r",groups:["กลุ่มบริหารงานบุคคล","ภาษาไทย"]}],headActions:[]};
assert.equal(pendingHeadGroups(book,person,settings).length,2);
assert.equal(pendingHeadGroups({...book,routingEntries:[{id:"r",groups:["ภาษาไทย"]}]},person,settings).length,1);
const completedBook={...book,headActions:[{id:"a",group:"ภาษาไทย"}]};
const directlyAssigned={...book,routingEntries:[{id:"direct",groups:[],userIds:["T1"]}]};
const duplicateGroups={...book,routingEntries:[{id:"a",groups:["ภาษาไทย"]},{id:"b",groups:["ภาษาไทย"]}]};
assert.deepEqual(directorHeadRoutingProgress([completedBook,directlyAssigned,duplicateGroups],[person],settings),
  {pending:2,completed:1},"Count active routed head-group responsibilities, not all approved docs");
assert.deepEqual(directorHeadRoutingProgress([completedBook],[{...person,status:"inactive"}],settings),
  {pending:0,completed:0},"Inactive head should not create pending work");
assert.deepEqual(directorHeadRoutingProgress([{...book,status:"รอผู้อำนวยการ"},{...book,isDeleted:true}],[person],settings),
  {pending:0,completed:0},"Exclude unapproved and deleted books");
const statArea=workspace.slice(workspace.indexOf('className="grid grid-cols-2 gap-2 sm:gap-3"'),
  workspace.indexOf('className="grid items-start gap-4'));
assert.ok(workspace.includes("directorHeadRoutingProgress(routed,dbUsers,systemSettings)"));
assert.ok(statArea.includes("directorProgress.pending"));
assert.ok(statArea.includes("directorProgress.completed"));
assert.ok(statArea.includes("headPending.length"));
assert.ok(statArea.includes("headDone.length"));
assert.ok(!statArea.includes("หนังสือเข้าอนุมัติแล้ว"));

console.log("PASS: modern director and head routing, director menu hidden, safe recipients, accurate two-card stats");
