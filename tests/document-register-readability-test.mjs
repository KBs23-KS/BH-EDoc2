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
assert.ok(style.includes("/* BHS Document Register Readability 2026-11-02"),"Scoped styling is present");
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
assert.ok(table.includes('className="mb-3 flex w-full min-w-0 items-center justify-center text-center"'),"Status badge stays centered in the status column");
assert.ok(table.includes('className="mt-3 flex w-full min-w-0 flex-wrap items-center justify-center gap-2 border-t border-gray-100 pt-3"'),"Edit/delete group centers and wraps on narrow viewports");
assert.ok(table.includes('inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-blue-200'),"Edit button must stay fully visible when narrow");
assert.ok(table.includes('inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-red-200'),"Delete button must stay fully visible when narrow");
assert.ok(table.includes("openEditDocModal(docObj)"),"Edit behavior preserved");
assert.ok(table.includes("setDocToDelete(docObj.id)"),"Delete behavior preserved");
// Regression for the 2026-11-02 screenshot: huge document filenames made
// the left column consume the table width, clipping the actions on the right.
assert.ok(table.includes('className="bhs-doc-table w-full min-w-0 table-fixed'),"Document table must use fixed layout");
assert.ok(!table.includes('min-w-[200px] md:min-w-[300px]'),"Header must not force intrinsic widths");
assert.ok(!table.includes('align-top w-1/2'),"Document columns must not use competing half-width classes");
assert.ok(style.includes('@media (min-width:721px)'),"Desktop proportions must not override mobile cards");
assert.ok(style.includes('width:70%;'),"Details column gets a bounded share");
assert.ok(style.includes('width:30%;'),"Status/actions column reserves enough room");
assert.ok(table.includes('flex min-w-0 items-center max-w-full overflow-hidden'),"Long PDF links must not expand table");
assert.ok((table.match(/className="min-w-0 truncate" title={f.name}/g)||[]).length===2,"Original and signed filenames truncate within the cell");
assert.ok(style.includes('text-overflow:ellipsis'),"Long filenames use ellipsis");
console.log("Three registers, centered actions and fixed-column filename overflow PASS");
