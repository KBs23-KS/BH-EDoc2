/**
 * Security-policy regression tests for REAL BHS-shaped (fictional) documents.
 * Pure offline test. No Firebase project, no HTTP requests, no school accounts.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {filterSchoolDocuments,filterSchoolReservations,filterSchoolReminders,
  safeSchoolSettings,canReceiveSchoolDoc} from "../shared/secureDocumentFeed.js";
import {canExecuteRoutingAction,validateRoutingInput}
  from "../shared/secureRoutingPolicy.js";
import {validateSecurePreviewTarget} from "../src/secureSessionPreview.js";

const settings={
  schoolName:"โรงเรียนจำลอง",academicYear:"2569",
  adminDepts:["กลุ่มบริหารวิชาการ"],
  subjectAreas:["วิทยาศาสตร์","คณิตศาสตร์"],
  adminHeads:{"กลุ่มบริหารวิชาการ":{primary:"TEST_HEAD",acting:"TEST_ACTING"}},
  subjectHeads:{"วิทยาศาสตร์":{primary:"TEST_SUBJECT",acting:""}},
  password:"SHOULD_NEVER_LEAVE_SERVER",
  backupSecret:"SHOULD_NEVER_LEAVE_SERVER"
};
const base=(id,role,adminDept="-",subjectArea="-",status="active")=>({
  id,name:id,role,adminDept,subjectArea,status
});
const users=[
  base("TEST_ADMIN","admin"),
  base("TEST_DIRECTOR","director"),
  base("TEST_DEPUTY","deputy"),
  base("TEST_CLERK","clerk"),
  base("TEST_HEAD","teacher","กลุ่มบริหารวิชาการ","คณิตศาสตร์"),
  base("TEST_ACTING","teacher","กลุ่มบริหารวิชาการ","คณิตศาสตร์"),
  base("TEST_SUBJECT","teacher","-","วิทยาศาสตร์"),
  base("TEST_TEACHER","teacher","กลุ่มบริหารวิชาการ","วิทยาศาสตร์"),
  base("TEST_OUTSIDER","teacher","-","คณิตศาสตร์"),
  base("TEST_DISABLED","teacher","กลุ่มบริหารวิชาการ","วิทยาศาสตร์","inactive")
];
const [admin,director,deputy,clerk,head,acting,subject,teacher,outsider,disabled]=users;
const final="เผยแพร่แล้ว",pending="รอผู้อำนวยการ";
const doc=(id,overrides={})=>({
  id,type:"หนังสือเข้า",subject:"เอกสารทดสอบ",status:final,
  createdBy:"TEST_CLERK",assignedTo:"",
  recipientsSnapshot:[],routingEntries:[],headActions:[],
  acknowledgedBy:[],assignmentAcknowledged:[],history:[],
  isDeleted:false,...overrides
});
const docs=[
  doc("TEST_INCOMING",{status:"รอรองผู้อำนวยการ"}),
  doc("TEST_PENDING",{status:pending,type:"คำสั่งโรงเรียน",
    createdBy:"TEST_TEACHER"}),
  doc("TEST_ROUTED",{assignedTo:"กลุ่มบริหารวิชาการ",
    recipientsSnapshot:[{id:"TEST_TEACHER",name:"ครูจำลอง"}],
    routingEntries:[{id:"R1",groups:["กลุ่มบริหารวิชาการ"],
      userIds:["TEST_TEACHER"]}]}),
  doc("TEST_SUBJECT",{assignedTo:"วิทยาศาสตร์",
    recipientsSnapshot:[{id:"TEST_SUBJECT",name:"หัวหน้าสาระ"}]}),
  doc("TEST_PRIVATE",{type:"คำสั่งโรงเรียน",createdBy:"TEST_DIRECTOR",
    recipientsSnapshot:[{id:"TEST_OUTSIDER",name:"ผู้รับเอกสาร"}]}),
  doc("TEST_DELETED",{isDeleted:true,recipientsSnapshot:[{id:"TEST_TEACHER"}]}),
  doc("TEST_RETURNED",{status:"ส่งกลับแก้ไข",createdBy:"TEST_TEACHER"})
];
const safe=safeSchoolSettings(settings);
assert.equal(safe.schoolName,"โรงเรียนจำลอง");
assert.equal("backupSecret" in safe,false);
assert.equal("password" in safe,false);
assert.equal(canReceiveSchoolDoc(teacher,docs[1],users,settings),true); // own draft
assert.equal(canReceiveSchoolDoc(outsider,docs[1],users,settings),false);
assert.equal(canReceiveSchoolDoc(teacher,docs[2],users,settings),true);
assert.equal(canReceiveSchoolDoc(outsider,docs[2],users,settings),false);
assert.equal(canReceiveSchoolDoc(head,docs[2],users,settings),true);
assert.equal(canReceiveSchoolDoc(acting,docs[2],users,settings),true);
assert.equal(canReceiveSchoolDoc(subject,docs[3],users,settings),true);
assert.equal(canReceiveSchoolDoc(outsider,docs[3],users,settings),false);
assert.equal(canReceiveSchoolDoc(outsider,docs[4],users,settings),true);
assert.equal(canReceiveSchoolDoc(disabled,docs[4],users,settings),false);
assert.equal(canReceiveSchoolDoc(admin,docs[5],users,settings),false);
assert.equal(canReceiveSchoolDoc(deputy,docs[1],users,settings),false);
assert.equal(canReceiveSchoolDoc(deputy,docs[0],users,settings),true);
assert.equal(canReceiveSchoolDoc(clerk,docs[0],users,settings),true);

const filtered=filterSchoolDocuments(teacher,[
  {...docs[2],passwordHash:"DONT_SEND",secret:"DONT_SEND"},
  docs[3],docs[4],docs[5],docs[6]
],users,settings);
assert.ok(filtered.some(d=>d.id==="TEST_ROUTED"));
assert.ok(filtered.some(d=>d.id==="TEST_RETURNED"));
assert.ok(!filtered.some(d=>d.id==="TEST_PRIVATE"));
assert.ok(!filtered.some(d=>d.isDeleted));
assert.equal("passwordHash" in filtered[0],false);
assert.equal("secret" in filtered[0],false);
assert.equal(filterSchoolReservations(teacher,[
  {id:"A",createdBy:"TEST_TEACHER"},
  {id:"B",createdBy:"TEST_OUTSIDER"}]).length,1);
assert.equal(filterSchoolReservations(admin,[
  {id:"A",createdBy:"TEST_TEACHER"},
  {id:"B",createdBy:"TEST_OUTSIDER"}]).length,2);
assert.equal(filterSchoolReminders(teacher,[
  {targetUserId:"TEST_TEACHER"},
  {targetUserId:"TEST_OUTSIDER"}]).length,1);

const can=(u,action,d,options={})=>
  canExecuteRoutingAction(u,action,d,options,users,settings);
const routed=docs[2];
const routeOptions={groups:["กลุ่มบริหารวิชาการ"],userIds:["TEST_TEACHER"],message:"แจ้งครู"};
assert.equal(can(director,"route",routed,routeOptions),true);
assert.equal(can(admin,"route",routed,routeOptions),true);
for(const u of [deputy,clerk,teacher,head,subject,disabled])
  assert.equal(can(u,"route",routed,routeOptions),false);
assert.equal(can(director,"route",docs[1],routeOptions),false);
assert.equal(can(director,"route",routed,{
  ...routeOptions,userIds:["TEST_DISABLED"]
}),false);
assert.equal(can(director,"route",routed,{
  ...routeOptions,groups:["กลุ่มปลอม"]
}),false);
assert.equal(validateRoutingInput("route",{
  ...routeOptions,userIds:["TEST_TEACHER","TEST_TEACHER"]
},settings,users),false);
const headOptions={group:"กลุ่มบริหารวิชาการ",userIds:["TEST_OUTSIDER"]};
assert.equal(can(head,"headAction",routed,headOptions),true);
assert.equal(can(acting,"headAction",routed,headOptions),true);
assert.equal(can(subject,"headAction",routed,headOptions),false);
assert.equal(can(outsider,"headAction",routed,headOptions),false);
assert.equal(can(subject,"headAction",docs[3],{
  group:"วิทยาศาสตร์",userIds:["TEST_TEACHER"]
}),true);
assert.equal(can(subject,"headAction",docs[3],{
  group:"วิทยาศาสตร์",userIds:["TEST_OUTSIDER"]
}),false);
assert.equal(can(subject,"headAction",docs[3],{
  group:"วิทยาศาสตร์",userIds:[],broadcastAllTeachers:true
}),true);
assert.equal(can(teacher,"acknowledge",routed,{}),true);
assert.equal(can(outsider,"acknowledge",routed,{}),false);
assert.equal(can(deputy,"acknowledge",routed,{}),false);
assert.equal(can(teacher,"acknowledge",docs[1],{}),false);
assert.equal(can(teacher,"acknowledge",{
  ...routed,acknowledgedBy:["TEST_TEACHER"]
},{}),false);
assert.equal(can(teacher,"acknowledgeAssignment",routed,{
  assignmentEventId:"R1"
}),true);
assert.equal(can(outsider,"acknowledgeAssignment",routed,{
  assignmentEventId:"R1"
}),false);
assert.equal(can(teacher,"acknowledgeAssignment",{
  ...routed,assignmentAcknowledged:["R1::TEST_TEACHER"]
},{assignmentEventId:"R1"}),false);
assert.equal(can(teacher,"route",routed,{...routeOptions,admin:true}),false);
// Unexpected client fields do not grant permissions.
assert.equal(can(teacher,"route",routed,{
  ...routeOptions,role:"admin",status:"เผยแพร่แล้ว"
}),false);

assert.equal(validateSecurePreviewTarget({
  requested:true,target:"bhs-edoc-security-test",projectId:"bhs-edoc-security-test"
}),true);
assert.equal(validateSecurePreviewTarget({
  requested:true,target:"bhs-edoc-security-test",projectId:"bhs-edoc-2"
}),false);
assert.equal(validateSecurePreviewTarget({
  requested:true,target:"bhs-edoc-2",projectId:"bhs-edoc-2"
}),false);

const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
const api=readFileSync(new URL("../api/secure-routing.js",import.meta.url),"utf8");
const feed=readFileSync(new URL("../api/secure-data.js",import.meta.url),"utf8");
const server=readFileSync(new URL("../api/_signatureServer.js",import.meta.url),"utf8");
assert.match(app,/SECURE_LOGIN_REQUESTED/);
assert.match(app,/bhs-secure-data-refresh/);
assert.match(app,/\/api\/secure-data/);
assert.match(app,/\/api\/secure-routing/);
assert.match(api,/BHS_ENABLE_SECURE_ROUTING_PREVIEW/);
assert.match(feed,/BHS_ENABLE_SECURE_DATA_PREVIEW/);
assert.match(server,/BHS_SERVER_ISOLATED_PREVIEW/);
assert.match(server,/bhs-edoc-security-test/);
assert.match(api,/db\.runTransaction/);
assert.match(api,/tx\.create/);
console.log("BHS preview read and routing boundaries: role/recipient/acting-head/transactional audit checks PASS");
