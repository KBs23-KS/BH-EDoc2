import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {labCooldownSeconds,makeLabPushPayload} from "../api/push-preview-lab.js";
import {demoNotificationEvent,demoRecipientEligible,TEST_SCENARIOS,TEST_RECEIVERS} from "../shared/pushPreviewFixtures.js";
import {mockAdvance,mockSummary,mockEligible,MOCK_STEPS} from "../shared/pushPreviewWorkflow.js";
import {validRoomCode,validMockRole,eligibleRoomMembers,roomPublicMembers,MAX_ROOM_MEMBERS,ROOM_TTL_MS,MAX_ROOM_CREATES_PER_DAY} from "../shared/pushPreviewMultiDevice.js";
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
let fake=null;
const now=Date.now();
const expectedKinds=["created","director","returned","created","director","published","head"];
for(let i=0;i<MOCK_STEPS.length;i++){
  const result=mockAdvance(fake,now+i*5000);
  assert.ok(result,"valid state transition "+i);
  assert.equal(result.step.kind,expectedKinds[i]);
  assert.equal(result.summary.index,i+1);
  assert.equal(mockEligible(result.event,result.step.receiver),true);
  assert.equal(mockEligible(result.event,"DISABLED"),false);
  assert.equal(mockEligible(result.event,"NOT_A_ROLE"),false);
  assert.ok(!JSON.stringify(result.event).includes("ข้อมูลจำลองเท่านั้น"));
  fake=result.record;
}
assert.equal(mockSummary(fake).done,true);
assert.equal(mockAdvance(fake,now+50000),null);
assert.equal(mockSummary(null).index,0);
assert.equal(mockAdvance({index:2,doc:{id:"WRONG_DOC"}},now),null);
assert.equal(MAX_ROOM_MEMBERS,4);
assert.equal(ROOM_TTL_MS,24*60*60*1000);
assert.equal(MAX_ROOM_CREATES_PER_DAY,10);
assert.equal(validRoomCode("abc".repeat(8)),true);
assert.equal(validRoomCode("guessable-room-code"),false);
assert.equal(validMockRole("DEPUTY"),true);
assert.equal(validMockRole("SPOOF_ROLE"),false);
const mockMembers=[
 {id:"a".repeat(64),role:"DEPUTY"},
 {id:"b".repeat(64),role:"TEACHER_B"},
 {id:"c".repeat(64),role:"DISABLED"},
 {id:"d".repeat(64),role:"DEPUTY"}
];
const fakeRoom={ownerId:"e".repeat(64),members:mockMembers};
const creationEvent=demoNotificationEvent("created",now);
assert.deepEqual(eligibleRoomMembers(creationEvent,fakeRoom).map(x=>x.role),
 ["DEPUTY","DEPUTY"],"deliver to both deputies, not unrelated or suspended roles");
assert.equal(eligibleRoomMembers(creationEvent,
 {...fakeRoom,ownerId:mockMembers[0].id}).length,1,
 "controller never receives a cross-device push");
assert.equal(roomPublicMembers(fakeRoom).find(x=>x.role==="DEPUTY").count,2);
assert.deepEqual(eligibleRoomMembers(creationEvent,
 {ownerId:"f".repeat(64),members:[{id:"bad",role:"DEPUTY"}]}),[]);
const first=makeLabPushPayload(),second=makeLabPushPayload();
assert.notEqual(first.tag,second.tag,"each test push must display a new notification");
assert.match(first.tag,/^bhs-push-lab-[0-9a-f]{16}$/);
assert.equal(first.url,"/push-preview-lab.html");
assert.equal(second.url,"/push-preview-lab.html");
assert.equal(makeLabPushPayload("ห้องจำลอง","/push-preview-room.html").url,
 "/push-preview-room.html");
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
const roomAPI=readFileSync(new URL("../api/push-preview-room.js",import.meta.url),"utf8");
const roomPage=readFileSync(new URL("../public/push-preview-room.html",import.meta.url),"utf8");
assert.match(roomAPI,/previewGuard\(\)/);
assert.match(roomAPI,/configured\(\)/);
assert.match(roomAPI,/database\(config\)/);
assert.match(roomAPI,/roomRef=\(db,id\)=>db.collection\(COUNTERS\)/);
assert.match(roomAPI,/ownerId!==data.deviceId/,"server checks controller");
assert.match(roomAPI,/expectedIndex/,"prevent double advance of mock workflow");
assert.match(roomAPI,/eligibleRoomMembers\(next.event,room\)/);
assert.match(roomAPI,/MAX_SENDS_PER_DEVICE/);
assert.match(roomAPI,/MAX_SENDS_GLOBAL/);
assert.match(roomAPI,/ROOM_TTL_MS/);
assert.match(roomPage,/Notification\.requestPermission/);
assert.match(roomPage,/action:"roomCreate"/);
// roomReq must NOT pass the locally stored nextSendAt into the strict API allowlist.
// This regression caused roomStatus/roomCreate to return HTTP 400 with no room code.
assert.match(roomPage,/deviceId:session\?\.deviceId,token:session\?\.token,\.\.\.payload/,
  "room requests send only deviceId/token and explicitly authorized action fields");
assert.doesNotMatch(roomPage,/roomReq=payload=>request\([^\n]*\.\.\.session/,
  "room requests must never spread the complete session object");
assert.match(roomAPI,/Object\.keys\(data\)\.some\(k=>!\[/,
  "server must preserve the strict API request allowlist");
assert.match(roomPage,/action:"roomJoin"/);
assert.match(roomPage,/action:"roomAdvance"/);
assert.match(roomPage,/action:"roomLeave"/);
assert.match(sw,/push-preview-room\.html/);
assert.doesNotMatch(roomAPI,/bhs_documents|bhs_users|bhs-edoc-2|firebaseapp\.com/);
assert.doesNotMatch(roomPage,/bhs_documents|bhs_users|bhs-edoc-2|firebaseapp\.com/);
assert.match(page,/จำกัดเว้น 3 วินาที/,"3-second user-visible cooldown");
assert.match(page,/Number\(seconds\)\|\|3/,"3-second UI fallback");
assert.match(api,/data.action==="send"\|\|data.action==="simulateEvent"/);
assert.match(api,/\["workflowStatus","workflowAdvance","workflowReset"\]/);
assert.match(api,/workflow:next.record/);
assert.match(page,/action:"workflowAdvance"/);
assert.match(page,/action:"workflowReset"/);
assert.match(page,/action:"workflowStatus"/);
assert.match(api,/if\(demo&&!demo.eligible\)return/,"ineligible mock recipient must not send");
assert.match(api,/demoRecipientEligible\(data.scenario,data.recipientId,now\)/);
assert.match(page,/request\(\{action:"simulateEvent"/);
assert.doesNotMatch(page,/MOCK_PUSH_LAB_|bhs_documents|bhs_users/);
assert.match(api,/MAX_SENDS_GLOBAL=60/);
assert.match(page,/Notification\.requestPermission/);
assert.doesNotMatch(page,/bhs_documents|bhs_users|firebaseConfig|__firebase_config/);
console.log("PASS: Preview Push Lab strictly sandbox-only; no production Firebase access");
