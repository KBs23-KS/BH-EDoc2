import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 INCOMING_RECEIPT_PREFIX,rawIncomingReceiptNumber,formatIncomingReceiptNumber,formatDocumentNumber
} from "../src/incomingReceiptDisplay.js";
import {registryRows} from "../src/reportExport.js";
import {incomingNumberConflict,normalizeIncomingNumber} from "../src/orderNumberPolicy.js";
import {matchingDocs} from "../src/workflow.js";

assert.equal(INCOMING_RECEIPT_PREFIX,"ศธ 04295.047/");
assert.equal(rawIncomingReceiptNumber(" 1281 "),"1281");
assert.equal(rawIncomingReceiptNumber("ศธ 04295.047/1281"),"1281");
assert.equal(rawIncomingReceiptNumber("ศธ 04295.047 / 1281 "),"1281");
assert.equal(formatIncomingReceiptNumber("1281"),"ศธ 04295.047/1281");
assert.equal(formatIncomingReceiptNumber(" ศธ 04295.047/1281 "),"ศธ 04295.047/1281",
 "Existing prefixed legacy values must never get doubled");
assert.equal(formatIncomingReceiptNumber(""),"-","Do not show a phantom prefixed number");
assert.equal(formatIncomingReceiptNumber(null)," - ".trim());
assert.equal(formatDocumentNumber({type:"หนังสือเข้า",docNumber:"1281"}),"ศธ 04295.047/1281");
assert.equal(formatDocumentNumber({type:"คำสั่งโรงเรียน",docNumber:"12/2569"}),"12/2569");
assert.equal(formatDocumentNumber({type:"หนังสือออก",docNumber:"5/2569"}),"5/2569");
assert.equal(formatDocumentNumber({type:"หนังสือเวียนแจ้งรับทราบ",docNumber:""}),"-");

const sourceDocs=[
 {id:"incoming",type:"หนังสือเข้า",docNumber:"1281",date:"2026-11-12",subject:"เรื่องทดสอบ"},
 {id:"order",type:"คำสั่งโรงเรียน",docNumber:"1/2569",date:"2026-11-12",subject:"เรื่องคำสั่ง"}
];
const exported=registryRows(sourceDocs);
assert.equal(exported[0][1],"ศธ 04295.047/1281","Excel/PDF use the full incoming receipt");
assert.equal(exported[1][1],"1/2569","Other register exports keep their original numbering");
assert.equal(sourceDocs[0].docNumber,"1281","Do not mutate source records while exporting");
assert.deepEqual(matchingDocs(sourceDocs,{q:"ศธ 04295.047/1281"}).map(d=>d.id),["incoming"],
 "Search accepts the newly displayed number");
assert.equal(normalizeIncomingNumber(sourceDocs[0].docNumber),"1281",
 "Incoming duplicate key remains its raw stored number");
assert.equal(incomingNumberConflict(sourceDocs,"1281","2026-11-12")?.id,"incoming",
 "Duplicate number validation remains enforced by year");

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const app=read("src/App.jsx"), routing=read("src/RoutingWorkspace.jsx");
const extensions=read("src/Extensions.jsx"),dash=read("src/DashboardHomePanels.jsx"),assign=read("src/AssignmentsWorkspace.jsx");
const exportJs=read("src/reportExport.js"),workflow=read("src/workflow.js");

assert.ok(app.includes('aria-label="เลขรับหลังคำนำหน้า ศธ 04295.047/"'),"Incoming input is clearly labeled");
assert.equal(app.split("{INCOMING_RECEIPT_PREFIX}").length-1,2,
 "Both incoming registration and edit show an immutable visual prefix");
assert.ok(app.includes("docNumber:rawIncomingReceiptNumber(e.target.value)"),"Registration input stores raw numbers");
assert.ok(app.includes("docNumber: rawIncomingReceiptNumber(e.target.value)"),"Edit input stores raw numbers");
assert.ok(app.includes("number:newDoc.docNumber,date:newDoc.date"),"Existing duplicate-lock still uses raw number");
assert.ok(app.includes("number:changes.docNumber,date:changes.date"),"Edit duplicate-lock still uses raw number");
assert.equal(app.split("formatIncomingReceiptNumber(docObj.docNumber)").length-1,2,
 "Tasks and register use a consistent display prefix");
assert.ok(app.includes('doc.type==="หนังสือเข้า"?formatIncomingReceiptNumber(doc.docNumber,""):""'),
 "Incoming register also matches searches containing the printed prefix");

assert.ok(routing.includes('เลขรับ {formatIncomingReceiptNumber(d.docNumber,"—")}'));
assert.ok(routing.includes('เลขรับ {formatIncomingReceiptNumber(doc.docNumber,"—")}'));
assert.ok(routing.includes("formatDocumentNumber(doc,doc.type)"),
 "Detail header uses the prefix only for incoming letters");
assert.ok(extensions.includes("formatDocumentNumber(d)"),
 "Cross-register search, pending report and acknowledgement list are formatted");
assert.ok(dash.includes("formatDocumentNumber(item.doc,item.doc.type)"),
 "Home dashboard is formatted consistently");
assert.ok(assign.includes("formatDocumentNumber(doc,doc.type)"),
 "Assignment cards show printed incoming numbers");
assert.ok(exportJs.includes("formatDocumentNumber(d,'')"),
 "Export formats just the display column, not stored records");
assert.ok(exportJs.includes("const widths=[112,180"),
 "PDF number column has room for the longer displayed prefix");
assert.ok(workflow.includes("formatDocumentNumber(d,\"\")"),
 "Global search includes the displayed form");
console.log("PASS: official incoming prefix across views and exports; stored numbers and duplicate policy unchanged");
