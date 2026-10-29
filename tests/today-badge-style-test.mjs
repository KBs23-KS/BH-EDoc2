import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/style.css",import.meta.url),"utf8");
const badge=app.match(/\{docObj\.date === getTodayIso\(\) && <span className="([^"]+)">ใหม่ วันนี้<\/span>\}/);
assert.ok(badge,"Today badge must still be conditional on today's document date");
assert.ok(badge[1].includes("bhs-new-today-badge"),"Only today badge gets new attention styling");
assert.ok(badge[1].includes("text-[10px]"),"Keep label small");
assert.ok(css.includes(".bhs-new-today-badge {"),"Red badge styling exists");
assert.ok(css.includes("background:#dc2626"),"Red badge must remain visible");
assert.ok(css.includes("animation:bhs-new-today-pulse"),"Pulse animation exists");
assert.ok(css.includes("@keyframes bhs-new-today-pulse"),"Pulse keyframes are defined");
assert.ok(css.includes("@media (prefers-reduced-motion:reduce)"),"Reduced motion is respected");
assert.ok(css.includes(".bhs-new-today-badge {animation:none;}"),"Motion can be disabled");
assert.equal(app.split("bhs-new-today-badge").length-1,1,"Style applies only to the requested badge");
console.log("BHS new today red badge UI regression checks passed");
