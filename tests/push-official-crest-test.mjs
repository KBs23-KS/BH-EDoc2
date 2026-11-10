import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const original=readFileSync(new URL("../public/bhs-school-crest.png",import.meta.url));
assert.equal(original.subarray(0,8).toString("hex"),"89504e470d0a1a0a","Authentic school crest asset remains a PNG");
assert.equal(original.readUInt32BE(16),160,"Use the existing school crest; do not redraw or replace it");
assert.equal(original.readUInt32BE(20),181);
assert.ok(original.includes(Buffer.from("tRNS")),"Preserve crest transparency");

const sw=read("public/sw.js");
const notify=sw.match(/self\.registration\.showNotification\(/g)||[];
assert.equal(notify.length,1,"All push event categories share one notification rendering path");
assert.ok(sw.includes('icon:"/bhs-school-crest.png",badge:"/bhs-school-crest.png"'));
assert.ok(!sw.includes('icon:"/icon-192.png"'));
assert.ok(sw.includes("data.badgeCount"),"Existing app-badge count behavior is unchanged");
assert.ok(sw.includes("notificationclick"),"Notification-click behavior is unchanged");

const index=read("index.html");
assert.ok(index.includes('rel="apple-touch-icon" href="/bhs-school-crest.png"'));
assert.ok(index.includes('rel="icon" href="/bhs-school-crest.png"'));
for(const page of [
  "public/push-preview-check.html",
  "public/push-preview-lab.html",
  "public/push-preview-room.html"
]){
  assert.ok(read(page).includes('rel="apple-touch-icon" href="/bhs-school-crest.png"'),
    page+" should use the official icon in installed iOS preview");
}
const preview=read("public/push-preview-check.html");
assert.ok(preview.includes('icon:"/bhs-school-crest.png"'));
assert.ok(preview.includes('badge:"/bhs-school-crest.png"'));
console.log("PASS: all push categories use original BHS school crest; Apple icon and preview aligned");
