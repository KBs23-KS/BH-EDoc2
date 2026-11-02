import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
const tasks=app.slice(app.indexOf("function TasksView("),app.indexOf("function ",app.indexOf("function TasksView(")+1));

assert.ok(tasks.includes('["คำสั่งโรงเรียน","หนังสือเวียนแจ้งรับทราบ"].includes(docObj.type)?"ลงนาม / อนุมัติ":"อนุมัติ / สั่งการ"'),"Orders and circulars show signing label; incoming keeps its existing action");
assert.equal(tasks.split("ลงนาม / อนุมัติ").length-1,1,"Director action label should occur once");
assert.ok(app.includes('const isSinglePdfDocument = type => ["คำสั่งโรงเรียน", "หนังสือเวียนแจ้งรับทราบ"].includes(type)'),"Both types require one PDF");
assert.ok(tasks.includes('if (actionType === "APPROVE" && isDirectorStage && isSinglePdfDocument(docObj.type) && !signedPdf)'),"Orders and circulars both require the PDF signing editor before approval");
assert.ok(tasks.includes('if (!signedPdf) throw new Error("ต้องลงนาม PDF ก่อนอนุมัติเอกสาร")'),"Approval cannot skip signed PDF");
assert.ok(!tasks.includes("rawSignedFiles"),"The old multi-file circular upload is removed");
assert.ok(tasks.includes('if (actionType === "APPROVE" && isDirectorStage && docObj.type === "หนังสือเข้า")'),"Incoming document routing is unchanged");
assert.ok(app.includes('status: docObj.type === "คำสั่งโรงเรียน" || docObj.type === "หนังสือเวียนแจ้งรับทราบ" ? DOC_STATUS.PUBLISHED : DOC_STATUS.COMPLETED'),"Publication state logic unchanged");
assert.ok(app.includes('const DOC_STATUS = {'),"Historical status names unchanged");
console.log("Director's order/circular one-PDF signing policy validated");
