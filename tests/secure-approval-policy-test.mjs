import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  authorizeDocumentReview,allowedReviewRecipients,mayApproveWithoutPdf,
  WAITING_DEPUTY,WAITING_DIRECTOR,RETURNED,COMPLETED
} from "../shared/secureApprovalPolicy.js";
const user=(role,status="active")=>({id:"TEST_"+role.toUpperCase(),role,status});
const deputy=user("deputy"),director=user("director"),admin=user("admin"),
  clerk=user("clerk"),teacher=user("teacher"),inactive=user("director","inactive");
const doc=(status,type="หนังสือเข้า")=>({
  id:"TEST_DOC",status,type,isDeleted:false,createdBy:"TEST_CLERK"
});
const waitingD=doc(WAITING_DEPUTY),waitingDirector=doc(WAITING_DIRECTOR);
for(const action of ["APPROVE","RETURN"]){
  assert.equal(authorizeDocumentReview(deputy,waitingD,action),true);
  assert.equal(authorizeDocumentReview(admin,waitingD,action),true);
  assert.equal(authorizeDocumentReview(director,waitingD,action),false);
  assert.equal(authorizeDocumentReview(teacher,waitingD,action),false);
  assert.equal(authorizeDocumentReview(director,waitingDirector,action),true);
  assert.equal(authorizeDocumentReview(admin,waitingDirector,action),true);
  assert.equal(authorizeDocumentReview(deputy,waitingDirector,action),false);
  assert.equal(authorizeDocumentReview(clerk,waitingDirector,action),false);
  assert.equal(authorizeDocumentReview(inactive,waitingDirector,action),false);
  assert.equal(authorizeDocumentReview(director,doc(RETURNED),action),false);
  assert.equal(authorizeDocumentReview(admin,doc(COMPLETED),action),false);
  assert.equal(authorizeDocumentReview(admin,{...waitingDirector,isDeleted:true},action),false);
}
assert.equal(mayApproveWithoutPdf(waitingDirector),true);
assert.equal(mayApproveWithoutPdf(doc(WAITING_DIRECTOR,"คำสั่งโรงเรียน")),false);
assert.equal(mayApproveWithoutPdf(doc(WAITING_DIRECTOR,"หนังสือเวียนแจ้งรับทราบ")),false);
assert.equal(mayApproveWithoutPdf(waitingD),false);
const users=[
  {id:"TEST_A",status:"active",role:"teacher"},
  {id:"TEST_B",status:"inactive",role:"teacher"},
  {id:"TEST_C",status:"active",role:"clerk"}
];
const settings={adminDepts:["กลุ่มวิชาการ"],subjectAreas:["วิทยาศาสตร์"]};
const valid={groups:["กลุ่มวิชาการ"],userIds:["TEST_A"],all:false};
assert.equal(allowedReviewRecipients(valid,users,settings),true);
assert.equal(allowedReviewRecipients({groups:[],userIds:[],all:true},users,settings),true);
assert.equal(allowedReviewRecipients({groups:[],userIds:[],all:false},users,settings),false);
assert.equal(allowedReviewRecipients({...valid,groups:["กลุ่มปลอม"]},users,settings),false);
assert.equal(allowedReviewRecipients({...valid,userIds:["TEST_B"]},users,settings),false);
assert.equal(allowedReviewRecipients({...valid,userIds:["TEST_A","TEST_A"]},users,settings),false);
assert.equal(allowedReviewRecipients({...valid,groups:["กลุ่มวิชาการ","กลุ่มวิชาการ"]},users,settings),false);

const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
const server=readFileSync(new URL("../api/secure-workflow.js",import.meta.url),"utf8");
assert.match(app,/\/api\/secure-workflow/);
assert.match(app,/การอนุมัติคำสั่ง\/หนังสือเวียนต้องลงนาม PDF/);
assert.match(server,/BHS_ENABLE_SECURE_WORKFLOW_PREVIEW/);
assert.match(server,/mayApproveWithoutPdf\(record\)/);
assert.match(server,/db\.runTransaction/);
assert.match(server,/tx\.create/);
assert.doesNotMatch(server,/signedFiles\s*:/);
console.log("BHS secure review: deputy/director permissions, recipient validation and PDF no-bypass checks PASS");
