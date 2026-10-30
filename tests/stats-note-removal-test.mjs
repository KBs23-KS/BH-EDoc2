import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../src/Extensions.jsx",import.meta.url),"utf8");
assert.ok(!source.includes("ตัวเลขคำนวณจากรายการที่แอปโหลดและมองเห็นตามสิทธิ์เท่านั้น"),"Remove only the explanatory note");
assert.ok(!source.includes("ยังไม่ใช่ยอดรวมจากการ aggregate บน Firestore"));
assert.ok(source.includes("export function StatsDashboard({documents,currentUser,dbUsers,changeMenu})"),"Dashboard retained");
assert.ok(source.includes("const allowed="),"Dashboard role-filter logic retained");
assert.ok(source.includes("quarterlySeries"),"Dashboard statistics computation retained");
console.log("Stats dashboard scope-note hidden without modifying dashboard logic");
