import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {labCooldownSeconds,makeLabPushPayload} from "../api/push-preview-lab.js";
import {demoNotificationEvent,demoRecipientEligible,TEST_SCENARIOS,TEST_RECEIVERS} from "../shared/pushPreviewFixtures.js";
const expected={
 created:["DEPUTY","ADMIN"],director:["DIRECTOR","ADMIN"],
 returned:["TEACHER_A"],published:["TEACHER_A","TEACHER_B","HEAD"],
 route:["TEACHER_A","TEACHER_B","HEAD"],head:["TEACHER_B"]
};
for(const item of TEST_SCENARIOS){
 const event=demoNotificationEvent(item.kind,Date.now());
 assert.ok(event,"scenario must generate event: "+item.kind);
 assert.deepEqual([...event.recipientIds].sort(),[...expected[item.kind]].sort(),
   "correct sample recipients for "+item.kind);
 assert.ok(!event.recipientIds.includes("DISABLED"),"inactive test user cannot receive");
 for(const {id} of TEST_RECEIVERS){
  const result=demoRecipientEligible(item.kind,id);
  assert.equal(result.eligible,expected[item.kind].includes(id),
    item.kind+" permission of "+id);
 }
}
assert.equal(demoRecipientEligible("created","UNKNOWN"),null);
assert.equal(demoRecipientEligible("fake","ADMIN"),null);
const first=makeLabPushPayload(),second=makeLabPushPayload();
assert.notEqual(first.tag,second.tag,"each test push must display a new notification");
assert.match(first.tag,/^bhs-push-lab-[0-9a-f]{16}$/);
assert.equal(first.url,"/push-preview-lab.html");
assert.equal(second.url,"/push-preview-lab.html");
assert.equal(labCooldownSeconds(160000,159999),3);
assert.equal(labCooldownSeconds(160000,158501),2);
assert.equal(labCooldownSeconds(160000,157000),0);
assert.equal(labCooldownSeconds(160000,0),0);
const api=readFileSync(new URL("../api/push-preview-lab.js",import.meta.url),"utf8");
const page=readFileSync(new URL("../public/push-preview-lab.html",import.meta.url),"utf8");
assert.match(api,/VERCEL_ENV!=="preview"/,"API cannot run on Production");
assert.match(api,/VERCEL_GIT_COMMIT_REF!==BRANCH/,"API only works on PR46 branch");
assert.match(api,/config\?\.project_id!==PROJECT/,"server must reject wrong Firebase credentials");
assert.match(api,/const PROJECT="bhs-edoc-security-test"/);
assert.match(api,/BHS_PUSH_LAB_RULES_VERIFIED/,"must verify sandbox Firestore Rules first");
assert.match(api,/aes-256-gcm/,"stored subscriptions must be encrypted");
assert.match(api,/MAX_SENDS_GLOBAL=60/,"global send ceiling must exist");
assert.match(api,/safeCompare\(record.secretHash,hex\(data.token\)\)/);
assert.doesNotMatch(api,/bhs_documents|bhs_users|firebaseapp\.com|bhs-edoc-2/);
const sw=readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");
assert.match(sw,/push-preview-lab\.html/,"test pushes must open lab, not school's document UI");
assert.match(page,/pushManager\.subscribe/);
assert.match(page,/setInterval\(refresh,1000\)/,"show remaining seconds live");
assert.match(page,/secondsUntilRetry\(\)>0/,"prevent rapid sends in browser");
assert.match(page,/error\.retryAfterSeconds=x\.retryAfterSeconds/);
assert.match(api,/retryAfterSeconds:labCooldownSeconds\(Date\.now\(\),now\)/);
assert.match(api,/MAX_SENDS_PER_DEVICE=10/);
assert.match(api,/const COOLDOWN_MS=3\*1000;/,"3-second server cooldown");
assert.match(page,/จำกัดเว้น 3 วินาที/,"3-second user-visible cooldown");
assert.match(page,/Number\(seconds\)\|\|3/,"3-second UI fallback");
assert.match(api,/data.action==="send"\|\|data.action==="simulateEvent"/);
assert.match(api,/if\(demo&&!demo.eligible\)return/,"ineligible mock recipient must not send");
assert.match(api,/demoRecipientEligible\(data.scenario,data.recipientId,now\)/);
assert.match(page,/request\(\{action:"simulateEvent"/);
assert.doesNotMatch(page,/MOCK_PUSH_LAB_|bhs_documents|bhs_users/);
assert.match(api,/MAX_SENDS_GLOBAL=60/);
assert.match(page,/Notification\.requestPermission/);
assert.doesNotMatch(page,/bhs_documents|bhs_users|firebaseConfig|__firebase_config/);
console.log("PASS: Preview Push Lab strictly sandbox-only; no production Firebase access");
