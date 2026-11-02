import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
const style=readFileSync(new URL("../src/style.css",import.meta.url),"utf8");
const badge=app.slice(app.indexOf("function StatusBadge({ status })"),app.indexOf("const writeAuditLog",app.indexOf("function StatusBadge({ status })")));
const table=app.slice(app.indexOf("function AdvancedSearchTable("),app.indexOf("\nfunction ",app.indexOf("function AdvancedSearchTable(")+1));
assert.ok(badge.includes('status === DOC_STATUS.WAITING_DEPUTY) color = "bg-blue-100 text-blue-700 border-blue-300"'),"Deputy waiting badge should be blue");
assert.ok(badge.includes('status === DOC_STATUS.WAITING_DIRECTOR) color = "bg-orange-100 text-orange-800 border-orange-300"'),"Director waiting badge should be orange");
assert.ok(badge.includes("text-[12px]"),"Status badge uses legible 12px text");
assert.ok(badge.includes("DOC_STATUS.COMPLETED || status === DOC_STATUS.PUBLISHED"),"Published and approved remain green");
assert.ok(badge.includes('DOC_STATUS.RETURNED'),"Returned remains red");
assert.equal((table.match(/className="bhs-document-record hover:bg-blue-50\/30 transition-colors"/g)||[]).length,1,"Every shared document row gets readability styling");
assert.ok(style.includes("/* BHS Document Register Readability 2026-11-02 */"),"Scoped styling is present");
assert.ok(style.includes("nth-child(even)"),"Alternating background colors are present");
assert.ok(style.includes("border-bottom:1px solid #ccd9e9"),"Rows have distinct horizontal divider");
assert.ok(style.includes("border-left:3px solid #b1c6e2"),"Desktop rows get subtle left accent");
assert.ok(style.includes("border-top:1px solid #dbe6f4!important"),"Mobile keeps clear detail separator");
for(const tag of ["function IncomingView(","function OrdersView(","function CircularsView("]){
  const start=app.indexOf(tag);
  const end=app.indexOf("\nfunction ",start+tag.length);
  assert.ok(start>=0&&end>start,tag+" exists");
  assert.ok(app.slice(start,end).includes("<AdvancedSearchTable"),tag+" uses shared improved table");
}
for(const key of ["onClick={() => handleAcknowledge(docObj.id)}","setHistoryModalDoc(docObj)","setVersionsDoc(docObj)"]){
  assert.ok(table.includes(key),"Existing document actions remain "+key);
}
console.log("Three register views, status badge colors and desktop/mobile separators PASS");
