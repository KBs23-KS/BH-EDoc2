/**
 * Real BHS returned-document revision APIs against synthetic Firestore
 * Emulator + fake private GAS. No real school PDFs, accounts or credentials.
 */
import assert from "node:assert/strict";
import {randomUUID,randomBytes,generateKeyPairSync} from "node:crypto";
import {createServer} from "node:http";
import {PDFDocument} from "pdf-lib";
import {initializeApp,deleteApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {makeAppSession,appSessionFingerprint} from "../api/_signatureServer.js";
import {migrateSyntheticUserCredential} from "../api/_schoolCredentialVault.js";
import revisionHandler from "../api/secure-revision.js";
const PROJECT="bhs-edoc-security-test",HOST="127.0.0.1:8099";
if(process.env.FIRESTORE_EMULATOR_HOST!==HOST)
  throw new Error("Only local Firestore Emulator is permitted");
const KEYS=[
  "VERCEL_ENV","BHS_SERVER_ISOLATED_PREVIEW",
  "BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW","BHS_CREDENTIAL_VAULT_AUDITED",
  "BHS_ENABLE_SECURE_REVISION_PREVIEW","BHS_TEST_GAS_UPLOAD_URL",
  "BHS_TEST_GAS_UPLOAD_SECRET",
  "BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON","BHS_TEST_SESSION_SECRET"
];
const originals=Object.fromEntries(KEYS.map(k=>[k,process.env[k]]));
const {privateKey}=generateKeyPairSync("rsa",{
  modulusLength:2048,publicKeyEncoding:{type:"spki",format:"pem"},
  privateKeyEncoding:{type:"pkcs8",format:"pem"}
});
const secret="ISOLATED_FAKE_REVISION_SECRET_".repeat(3);
Object.assign(process.env,{
  VERCEL_ENV:"preview",BHS_SERVER_ISOLATED_PREVIEW:"true",
  BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW:"true",
  BHS_CREDENTIAL_VAULT_AUDITED:"true",
  BHS_ENABLE_SECURE_REVISION_PREVIEW:"true",
  BHS_TEST_GAS_UPLOAD_URL:"http://127.0.0.1:8101/upload",
  BHS_TEST_GAS_UPLOAD_SECRET:secret,
  BHS_TEST_SESSION_SECRET:"FAKE_REVISION_SESSION_SECRET_".repeat(3),
  BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
    project_id:PROJECT,
    client_email:"fake-revision-emulator@"+PROJECT+".iam.gserviceaccount.com",
    private_key:privateKey
  })
});
const app=initializeApp({projectId:PROJECT},"test-returned-pdf-revisions");
const db=getFirestore(app),ROOT="artifacts/bhs-edoc-app/public/data/";
const users=db.collection(ROOT+"bhs_users"),docs=db.collection(ROOT+"bhs_documents");
const creator="TEST_TEACHER_001",outsider="TEST_TEACHER_002",
  director="TEST_DIRECTOR_001";
const incoming="TEST_DOC_"+randomBytes(12).toString("hex").toUpperCase();
const order="TEST_DOC_"+randomBytes(12).toString("hex").toUpperCase();
let transportCount=0;
const fakeGas=createServer(async(req,res)=>{
  let content="";
  for await(const chunk of req)content+=chunk.toString("utf8");
  let body;
  try{body=JSON.parse(content);}
  catch{res.writeHead(400).end();return;}
  if(req.method!=="POST"||req.url!=="/upload"||
     body.action!=="secureUpload"||body.uploadSecret!==secret||
     ![incoming,order].some(id=>body.fileName?.startsWith(id+"-revision-"))||
     body.mimeType!=="application/pdf"||
     !Buffer.from(body.base64||"","base64").subarray(0,5).equals(Buffer.from("%PDF-"))){
    res.writeHead(403).end();return;
  }
  transportCount++;
  res.writeHead(200,{"Content-Type":"application/json"});
  res.end(JSON.stringify({
    success:true,fileId:"TEST_DRIVE_"+randomBytes(12).toString("hex").toUpperCase()
  }));
});
const reply=()=>({headers:{},statusCode:200,body:null,
  setHeader(key,value){this.headers[key]=value;return this;},
  status(value){this.statusCode=value;return this;},
  json(value){this.body=value;return this;}
});
async function run(uid,input){
  const snap=await users.doc(uid).get();
  const cookie="bhs_app_session="+makeAppSession(uid,appSessionFingerprint(snap.data()));
  const res=reply();
  await revisionHandler({
    method:"POST",headers:{
      host:"localhost",cookie,"content-type":"application/json",
      "sec-fetch-site":"same-origin"
    },body:input
  },res);
  return res;
}
const pass=r=>{assert.equal(r.statusCode,200,JSON.stringify(r.body));assert.equal(r.body.success,true);};
const deny=(r,status)=>assert.equal(r.statusCode,status,JSON.stringify(r.body));
try{
  await new Promise((resolve,reject)=>{
    fakeGas.once("error",reject);fakeGas.listen(8101,"127.0.0.1",resolve);
  });
  for(const [id,role] of [
    [creator,"teacher"],[outsider,"teacher"],[director,"director"]
  ]){
    const ref=users.doc(id);
    await ref.set({
      username:id,name:"บัญชีทดสอบ",role,status:"active",
      adminDept:"-",subjectArea:"-",password:"FAKE_ONLY"
    });
    await migrateSyntheticUserCredential({db,projectId:PROJECT,profileRef:ref,uid:id});
  }
  const originalFile={name:"original.pdf",driveId:"TEST_DRIVE_ORIGINAL0123456789",
    type:"PDF",mimeType:"application/pdf"};
  const draft={subject:"เอกสารก่อนแก้ไข",createdBy:creator,
    type:"หนังสือเข้า",status:"ส่งกลับแก้ไข",isDeleted:false,
    files:[originalFile],fileVersions:[{
      version:1,files:[originalFile],reason:"ฉบับแรก",timestamp:1
    }],activeFileVersion:1,rejectReason:"ขอแก้ไขต้นฉบับ",
    signedFiles:[],history:[{action:"ส่งกลับแก้ไข",timestamp:5}]
  };
  await docs.doc(incoming).set(draft);
  await docs.doc(order).set({...draft,type:"คำสั่งโรงเรียน",
    subject:"คำสั่งจำลองก่อนแก้ไข"});
  const pdf=await PDFDocument.create();pdf.addPage([420,595]);
  const base64=Buffer.from(await pdf.save()).toString("base64");
  const file=(docId,uploadId=randomUUID(),fileName="revision.pdf")=>({
    action:"stage",docId,uploadId,fileName,base64
  });
  const one=file(incoming);
  deny(await run(outsider,one),403);
  deny(await run(director,one),403);
  deny(await run(creator,{...one,signedFiles:[{fake:"signed"}]}),400);
  deny(await run(creator,{...one,fileName:"../evil.pdf"}),400);
  assert.equal(transportCount,0);
  let output=await run(creator,one);pass(output);
  assert.equal(transportCount,1);
  output=await run(creator,one);pass(output);
  assert.equal(output.body.duplicate,true);
  assert.equal(transportCount,1);
  const second=file(incoming);
  pass(await run(creator,second));
  assert.equal(transportCount,2);
  const before=(await docs.doc(incoming).get()).data();
  assert.equal(before.status,"ส่งกลับแก้ไข");
  assert.equal(before.files[0].driveId,originalFile.driveId,
    "Staging never modifies the visible original");

  const finalize=(docId,uploadIds,subject="เรื่องแก้ไขแล้ว")=>({
    action:"finalize",docId,uploadIds,subject
  });
  deny(await run(outsider,finalize(incoming,[one.uploadId])),403);
  deny(await run(creator,finalize(incoming,[randomUUID()])),403);
  deny(await run(creator,finalize(incoming,[one.uploadId,one.uploadId])),400);
  output=await run(creator,finalize(incoming,[one.uploadId,second.uploadId]));
  pass(output);
  assert.equal(output.body.activeFileVersion,2);
  const changed=(await docs.doc(incoming).get()).data();
  assert.equal(changed.status,"รอรองผู้อำนวยการ");
  assert.equal(changed.activeFileVersion,2);
  assert.equal(changed.fileVersions.length,2);
  assert.equal(changed.fileVersions[0].files[0].driveId,originalFile.driveId);
  assert.equal(changed.files.length,2);
  assert.equal(changed.fileVersions[1].files.length,2);
  assert.equal(changed.signedFiles.length,0);
  assert.equal(changed.rejectReason,"");
  assert.ok(changed.history.some(e=>e.action==="แก้ไขและส่งเรื่องใหม่"));
  deny(await run(creator,finalize(incoming,[one.uploadId,second.uploadId])),403);
  assert.equal((await docs.doc(incoming).get()).data().fileVersions.length,2);

  const orderOne=file(order);
  const orderTwo=file(order);
  pass(await run(creator,orderOne));
  pass(await run(creator,orderTwo));
  deny(await run(creator,finalize(order,[orderOne.uploadId,orderTwo.uploadId])),400);
  output=await run(creator,finalize(order,[orderOne.uploadId],"แก้คำสั่งจำลอง"));
  pass(output);
  const editedOrder=(await docs.doc(order).get()).data();
  assert.equal(editedOrder.files.length,1);
  assert.equal(editedOrder.fileVersions.length,2);
  assert.equal(editedOrder.status,"รอรองผู้อำนวยการ");
  assert.equal(editedOrder.signedFiles.length,0);
  // A PDF staged during revision 1 must never be used when the director
  // returns revision 2 for another correction cycle.
  await docs.doc(order).update({status:"ส่งกลับแก้ไข"});
  deny(await run(creator,finalize(order,[orderTwo.uploadId],
    "ห้ามใช้ไฟล์เก่าของรอบก่อน")),403);
  deny(await run(creator,orderTwo),400);
  assert.equal((await docs.doc(order).get()).data().activeFileVersion,2);
  assert.ok((await db.collection(ROOT+"bhs_audit_logs").get()).size>=2);
  console.log("PASS: returned-document revisions validate owner, stage PDFs,"+
    " preserve old version, enforce single-PDF orders and atomic resubmit");
}finally{
  await new Promise(resolve=>fakeGas.close(resolve));
  await deleteApp(app);
  for(const [key,value] of Object.entries(originals)){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
}
