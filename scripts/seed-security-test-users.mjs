/**
 * ADMIN-ONLY explicit opt-in. Never run in CI or Production.
 * Creates synthetic accounts and documents in bhs-edoc-security-test only.
 * Prints newly generated DEMO passwords to the operator's terminal once.
 */
import {randomBytes} from "node:crypto";
import {getApps,initializeApp,cert,deleteApp} from "firebase-admin/app";
import {getFirestore,Timestamp} from "firebase-admin/firestore";
import {hashSchoolPassword} from "../api/_passwordSecurity.js";
import {credentialLookupId,secretKey,TEST_PROJECT_ID} from "../api/_securityTestServer.js";

if(process.env.VERCEL==="1"||process.env.VERCEL_ENV==="production"||
   process.env.BHS_SECURITY_TEST_SEED_CONFIRM!==TEST_PROJECT_ID||
   process.env.BHS_SECURITY_TEST_DEPLOY_TARGET!==TEST_PROJECT_ID)
  throw new Error("Refusing to seed: explicit TEST PROJECT confirmation required");
const raw=process.env.BHS_FIREBASE_SECURITY_TEST_SERVICE_ACCOUNT_JSON;
if(!raw)throw new Error("Missing dedicated test service account");
const serviceAccount=JSON.parse(raw);
if(serviceAccount.project_id!==TEST_PROJECT_ID||serviceAccount.type!=="service_account")
  throw new Error("Refusing to seed non-test Firebase project");
const app=initializeApp({credential:cert(serviceAccount),projectId:TEST_PROJECT_ID},"bhs-test-seed");
const db=getFirestore(app);
const people=[
  {uid:"TEST_ADMIN_001",username:"test_admin",role:"admin",name:"แอดมินจำลอง"},
  {uid:"TEST_DIRECTOR_001",username:"test_director",role:"director",name:"ผู้อำนวยการจำลอง"},
  {uid:"TEST_DEPUTY_001",username:"test_deputy",role:"deputy",name:"รองผู้อำนวยการจำลอง"},
  {uid:"TEST_CLERK_001",username:"test_clerk",role:"clerk",name:"ธุรการจำลอง"},
  {uid:"TEST_HEAD_ADMIN_001",username:"test_head_admin",role:"teacher",name:"หัวหน้ากลุ่มงานจำลอง"},
  {uid:"TEST_HEAD_SUBJECT_001",username:"test_head_subject",role:"teacher",name:"หัวหน้ากลุ่มสาระจำลอง"},
  {uid:"TEST_TEACHER_001",username:"test_teacher",role:"teacher",name:"ครูจำลอง"}
];
const batch=db.batch(),passwords=[];
for(const person of people){
  const password=randomBytes(20).toString("base64url");
  const id=credentialLookupId(person.username,secretKey());
  const passwordHash=await hashSchoolPassword(password);
  batch.create(db.collection("bhs_security_test_credentials").doc(id),{
    uid:person.uid,role:person.role,status:"active",passwordHash
  });
  batch.create(db.collection("bhs_security_test_profiles").doc(person.uid),{
    name:person.name,role:person.role,status:"active",
    group:person.username.includes("head")?"synthetic-head":"synthetic"
  });
  passwords.push({username:person.username,password});
}
const everyone=people.map(p=>p.uid);
const cases=[
  {id:"TEST_SHARED_001",title:"หนังสือจำลองที่ครูทุกคนอ่านได้",status:"approved",readerUids:everyone},
  {id:"TEST_PRIVATE_001",title:"หนังสือจำลองจำกัดสิทธิ์",status:"approved",readerUids:["TEST_ADMIN_001","TEST_CLERK_001"]},
  {id:"TEST_DIRECTOR_PENDING",title:"หนังสือจำลองรออนุมัติ",status:"pending-director",readerUids:["TEST_ADMIN_001","TEST_DIRECTOR_001","TEST_DEPUTY_001"]}
];
for(const item of cases)batch.create(db.collection("bhs_security_test_documents").doc(item.id),{
  title:item.title,status:item.status,readerUids:item.readerUids,
  createdBy:"TEST_CLERK_001",createdAt:Timestamp.now()
});
try{
  await batch.commit();
  process.stdout.write("SYNTHETIC TEST CREDENTIALS — never share or commit these:\n");
  for(const row of passwords)process.stdout.write(row.username+": "+row.password+"\n");
  process.stdout.write("Seed complete in "+TEST_PROJECT_ID+" only. Keep this output private.\n");
}finally{
  await deleteApp(app);
}
