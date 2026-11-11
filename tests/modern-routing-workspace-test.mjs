import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {headGroups,pendingHeadGroups} from "../src/routing.js";

const source=readFileSync(new URL("../src/RoutingWorkspace.jsx",import.meta.url),"utf8");
const workspace=source.slice(source.indexOf("function ModernHeadRoutingWorkspace("),source.indexOf("function EventLine("));
const directorWorkspace=source.slice(source.indexOf("function LegacyDirectorRoutingWorkspace("),source.indexOf("export function RoutingWorkspace("));
const directory=source.slice(source.indexOf("function TeacherDirectoryPicker("),source.indexOf("function LegacyHeadRecipientPicker("));

assert.ok(source.includes("export function DocumentDetail("),"Existing detail route remains available");
assert.ok(workspace.includes("onOpen(doc.id)"),"Detail button must open the existing document/retirement view");
assert.ok(workspace.includes("เปิดดูเอกสารและข้อเกษียณ"),"Detail link uses the correct book title");
assert.ok(!workspace.includes("ดูเอกสารฉบับลงนาม"),"Incoming letters do not pretend to have director-signed PDF");
assert.ok(!workspace.includes("ดูหนังสือต้นฉบับ</button>"),"Remove duplicate action beside the primary button");

assert.ok(workspace.includes('data-testid="modern-routing-workspace"'),"Modern layout scoped to routing page");
assert.ok(workspace.includes("lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"),"Responsive two-column layout");
assert.ok(workspace.includes("ค้นหาเลขรับหรือชื่อเรื่อง"),"Book search exists");
assert.ok(workspace.includes("activeHeadRows=headTab"),"Pending/completed head tabs retained");
assert.ok(workspace.includes('switchHeadTab("pending")'));
assert.ok(workspace.includes('switchHeadTab("completed")'));
assert.ok(workspace.includes("myGroup.length===1"),"Single matched group should be shown automatically");
assert.ok(workspace.includes('myGroup.length===1?myGroup[0].group:""'),"More than one group requires explicit head choice");
assert.ok(workspace.includes("setActiveGroup(e.target.value)"),"Multiple groups can still be selected manually");

for (const mode of ['"head-ack"','"head-teachers"','"head-broadcast"']) {
  assert.ok(workspace.includes(mode),"Missing action card mode "+mode);
}
assert.ok(workspace.includes("choice===action.id"),"Action card visibly tracks selection");
assert.ok(workspace.includes("if(!confirm){setConfirm(true);return;}"),"Two-stage confirmation preserved");
assert.ok(workspace.includes("await onHeadAction(doc,"),"Existing head authorization is invoked");
assert.ok(directorWorkspace.includes("await onRoute(doc,"),"Legacy director route remains unchanged");
assert.ok(source.includes('["director","admin"].includes(props.currentUser?.role)'),"Director/admin roles use the legacy routing screen");
assert.ok(source.includes("<LegacyDirectorRoutingWorkspace {...props}/>"),"Director screen is delegated to the original component");
assert.ok(source.includes("<ModernHeadRoutingWorkspace {...props}/>"),"Modern screen is restricted to head routing");
assert.ok(workspace.includes("reassign:!!completed"),"Reassignment semantics remain");
assert.ok(workspace.includes("disabled={unableToSave}"),"Invalid requests are not submitted");

assert.ok(directory.includes('label:"กลุ่มงาน"'));
assert.ok(directory.includes('label:"กลุ่มสาระฯ"'));
assert.ok(directory.includes('label:"รายชื่อทั้งหมด"'));
assert.ok(directory.includes('!restrictedSubject||u.subjectArea===restrictedSubject'),
  "Subject heads cannot see teachers outside their assigned subject");
assert.ok(directory.includes("mode===\"all\"?eligible"),"All names is a directory view, not automatic selection");
assert.ok(directory.includes('allDisplayedSelected?"ยกเลิกที่แสดง":"เลือกทั้งหมดที่แสดง"'),
  "Bulk selection requires deliberate action");
assert.ok(directory.includes("new Set([...selected,...displayedIds])"),"Changing scopes preserves selected recipients");
assert.ok(directory.includes("selected.includes(u.id)"),"Individual checkbox selection is explicit");

const person={id:"H",role:"teacher",status:"active",adminDept:"กลุ่มบริหารงานบุคคล",subjectArea:"ภาษาไทย"};
const settings={
  adminHeads:{"กลุ่มบริหารงานบุคคล":{primary:"H"}},
  subjectHeads:{"ภาษาไทย":{primary:"H"}}
};
const book={type:"หนังสือเข้า",status:"เผยแพร่แล้ว",assignedTo:"-",
  routingEntries:[{id:"r",groups:["กลุ่มบริหารงานบุคคล","ภาษาไทย"]}],headActions:[]};
assert.equal(pendingHeadGroups(book,person,settings).length,2,"Head can receive two separate groups");
assert.equal(pendingHeadGroups({...book,routingEntries:[{id:"r",groups:["ภาษาไทย"]}]},person,settings).length,1,
  "When only one group is routed, head may process without choosing a group");


const statArea=workspace.slice(workspace.indexOf('className="grid grid-cols-2 gap-2 sm:gap-3"'),
  workspace.indexOf('className="grid items-start gap-4'));
assert.ok(statArea.includes("headPending.length"),"The pending counter is scoped to this head");
assert.ok(statArea.includes("headDone.length"),"The completed counter is scoped to this head");
assert.ok(!statArea.includes("หนังสือเข้าอนุมัติแล้ว"),"Remove irrelevant all-approved third card in head view");
assert.ok(directorWorkspace.includes("bhs-modern-page-title"),"Original director/admin UI retained");
assert.ok(!directorWorkspace.includes('data-testid="modern-routing-workspace"'),"Modern UI not shown to director/admin");

console.log("PASS: modern head routing, original director routing, two-card stats and safe teacher directory");
