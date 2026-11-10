import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {incomingCountText,incomingPublicationNotice}
  from "../shared/incomingPushText.js";

assert.equal(incomingCountText(5),"คุณมีหนังสือเข้ารอรับทราบ 5 เรื่อง");
assert.equal(incomingCountText(4),"คุณมีหนังสือเข้ารอรับทราบ 4 เรื่อง");
assert.equal(incomingCountText(0),"รับทราบหนังสือเข้าครบแล้ว");
for(const invalid of [-1,1.5,"5",NaN,Infinity,1000000])
  assert.equal(incomingCountText(invalid),null);

const teacher={id:"teacher-test",role:"teacher",status:"active"};
const clerk={id:"clerk-test",role:"clerk",status:"active"};
const staff={id:"director-test",role:"director",status:"active"};
assert.deepEqual(incomingPublicationNotice("published","หนังสือเข้า",teacher,5),{
  body:"คุณมีหนังสือเข้ารอรับทราบ 5 เรื่อง",
  tag:"bhs-unread-incoming",kind:"incoming-count"
});
assert.equal(incomingPublicationNotice("published","คำสั่งโรงเรียน",teacher,5),null);
assert.equal(incomingPublicationNotice("created","หนังสือเข้า",teacher,5),null);
assert.equal(incomingPublicationNotice("published","หนังสือเข้า",staff,5),null);
assert.equal(incomingPublicationNotice("published","หนังสือเข้า",{...clerk,status:"inactive"},5),null);
assert.equal(incomingPublicationNotice("published","หนังสือเข้า",clerk,4)?.body,
  "คุณมีหนังสือเข้ารอรับทราบ 4 เรื่อง");
assert.equal(incomingPublicationNotice("published","หนังสือเข้า",teacher,null),null);

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const server=read("api/_webPushServer.js"),dispatch=read("api/push-dispatch.js");
const sw=read("public/sw.js"),app=read("src/App.jsx"),endpoint=read("api/push-self-test.js");
assert.ok(server.includes("incomingPublicationNotice(event.kind,docType,user,count)"));
assert.ok(server.includes("body:incomingCountText(count)"));
assert.ok(server.includes("tag:\"bhs-unread-incoming\""));
assert.ok(server.includes('doc(sha("self-test:"+user.id+":"+day))'));
assert.ok(server.includes("Number(prev.count||0)>=12"));
assert.ok(dispatch.includes("pushSchoolEvent(event,users,doc.type)"));
assert.ok(endpoint.includes("verifiedPushUser(req)"),"Self test requires logged-in account");
assert.ok(endpoint.includes("pushSelfTest(user)"),"Push targets signed-in user only");
assert.ok(!endpoint.includes("req.body.userId"));
assert.ok(sw.includes('data.tag==="bhs-unread-incoming"'));
assert.ok(sw.includes('data.kind==="incoming-count"'));
assert.ok(app.includes('data-testid="incoming-badge-chip"'));
assert.ok(app.includes('aria-label={"หนังสือเข้าค้างรับทราบ "+pendingIconBadge'));
assert.ok(app.includes('"/api/push-self-test"'));
assert.ok(app.includes("onClick={testOwnWebPush}"));
console.log("PASS: published incoming Push includes per-user unread count, Android grouping, self-test authorization and 5 -> 4 -> 0");
