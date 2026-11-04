/**
 * Browser -> trusted BHS API -> fake private GAS -> Emulator document receipt.
 * ALL services are localhost, synthetic users, generated PDF bytes.
 * No live GAS, Google Drive, school documents, or production Firebase.
 */
import assert from "node:assert/strict";
import {randomUUID,randomBytes,generateKeyPairSync} from "node:crypto";
import {createServer} from "node:http";
import {PDFDocument} from "pdf-lib";
import {initializeApp,deleteApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {makeAppSession,appSessionFingerprint} from "../api/_signatureServer.js";
import {migrateSyntheticUserCredential} from "../api/_schoolCredentialVault.js";
import secureUploadHandler from "../api/secure-upload.js";

const HOST="127.0.0.1:8099",PROJECT="bhs-edoc-security-test";
if(process.env.FIRESTORE_EMULATOR_HOST!==HOST)
  throw Error("STOP: secure PDF integration test must run in local Emulator");
const envKeys=[
  "VERCEL_ENV","BHS_SERVER_ISOLATED_PREVIEW","BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW",
  "BHS_CREDENTIAL_VAULT_AUDITED","BHS_ENABLE_SECURE_UPLOAD_PREVIEW",
  "BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON","BHS_TEST_SESSION_SECRET",
  "BHS_TEST_GAS_UPLOAD_URL","BHS_TEST_GAS_UPLOAD_SECRET"
];
const previous=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
const {privateKey}=generateKeyPairSync("rsa",{
  modulusLength:2048,
  publicKeyEncoding:{type:"spki",format:"pem"},
  privateKeyEncoding:{type:"pkcs8",format:"pem"}
});
const secret="ONLY_FAKE_GAS_SECRET_".repeat(4);
Object.assign(process.env,{
  VERCEL_ENV:"preview",BHS_SERVER_ISOLATED_PREVIEW:"true",
  BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW:"true",
  BHS_CREDENTIAL_VAULT_AUDITED:"true",
  BHS_ENABLE_SECURE_UPLOAD_PREVIEW:"true",
  BHS_TEST_GAS_UPLOAD_URL:"http://127.0.0.1:8101/upload",
  BHS_TEST_GAS_UPLOAD_SECRET:secret,
  BHS_TEST_SESSION_SECRET:"ONLY_FAKE_APP_SESSION_".repeat(4),
  BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
    project_id:PROJECT,
    client_email:"fake-pdf-emulator@"+PROJECT+".iam.gserviceaccount.com",
    private_key:privateKey
  })
});
const app=initializeApp({projectId:PROJECT},"test-private-pdf-upload");
const db=getFirestore(app),ROOT="artifacts/bhs-edoc-app/public/data/";
const users=db.collection(ROOT+"bhs_users"),docs=db.collection(ROOT+"bhs_documents");
const clerk="TEST_CLERK_001",teacher="TEST_TEACHER_001";
const docId="TEST_DOC_"+randomBytes(12).toString("hex").toUpperCase();
let receiverCalls=0;
const localGas=createServer(async(req,res)=>{
  let bytes="";
  for await(const chunk of req)bytes+=chunk.toString("utf8");
  let data;
  try{data=JSON.parse(bytes);}
  catch{res.writeHead(400).end();return;}
  if(req.method!=="POST"||req.url!=="/upload"||
     data.action!=="secureUpload"||data.uploadSecret!==secret||
     !data.fileName?.startsWith(docId+"-")||
     !data.fileName.endsWith(".pdf")||
     data.mimeType!=="application/pdf"||
     !Buffer.from(data.base64||"","base64").subarray(0,5)
       .equals(Buffer.from("%PDF-"))){
    res.writeHead(403,{"Content-Type":"application/json"});
    res.end(JSON.stringify({success:false}));return;
  }
  receiverCalls++;
  res.writeHead(200,{"Content-Type":"application/json"});
  res.end(JSON.stringify({
    success:true,fileId:"TEST_DRIVE_"+randomBytes(12).toString("hex").toUpperCase(),
    fileName:data.fileName
  }));
});
function response(){
  return {headers:{},statusCode:200,body:null,
    setHeader(k,v){this.headers[k]=v;return this;},
    status(n){this.statusCode=n;return this;},
    json(payload){this.body=payload;return this;}
  };
}
async function invoke(uid,input){
  const profile=await users.doc(uid).get();
  const cookie="bhs_app_session="+makeAppSession(uid,appSessionFingerprint(profile.data()));
  const out=response();
  await secureUploadHandler({
    method:"POST",headers:{host:"localhost",cookie,
      "content-type":"application/json","sec-fetch-site":"same-origin"},
    body:input
  },out);
  return out;
}
const allowed=out=>{
  assert.equal(out.statusCode,200,JSON.stringify(out.body));
  assert.equal(out.body.success,true);
};
const denied=(out,status)=>{
  assert.equal(out.statusCode,status,JSON.stringify(out.body));
  assert.equal(out.body?.success,false);
};
try{
  await new Promise((resolve,reject)=>{
    localGas.once("error",reject);
    localGas.listen(8101,"127.0.0.1",resolve);
  });
  for(const [uid,role] of [[clerk,"clerk"],[teacher,"teacher"]]){
    const ref=users.doc(uid);
    await ref.set({
      username:uid,name:role+" fictional",status:"active",role,
      adminDept:"-",subjectArea:"-",password:"FAKE-PASSWORD"
    });
    await migrateSyntheticUserCredential({db,projectId:PROJECT,profileRef:ref,uid});
  }
  await docs.doc(docId).set({
    type:"หนังสือเข้า",status:"รอรองผู้อำนวยการ",
    createdBy:clerk,subject:"หนังสือเข้าทดสอบ",isDeleted:false,
    files:[],fileVersions:[{version:1,files:[],reason:"ฉบับแรก"}],
    activeFileVersion:1,history:[]
  });
  const pdf=await PDFDocument.create();
  pdf.addPage([400,560]);
  const encoded=Buffer.from(await pdf.save()).toString("base64");
  const uploadId=randomUUID();
  const input={docId,uploadId,fileName:"original-school-file.pdf",base64:encoded};
  denied(await invoke(teacher,input),403);
  assert.equal(receiverCalls,0,"No request to Drive mock if role fails");
  denied(await invoke(clerk,{...input,signedFiles:[{fileId:"FAKE"}]}),400);
  denied(await invoke(clerk,{...input,fileName:"../evil.pdf"}),400);
  denied(await invoke(clerk,{...input,base64:Buffer.from("%PDF-NOT_A_REAL_PDF").toString("base64")}),400);
  assert.equal(receiverCalls,0,"Invalid PDF must never reach transport");
  let result=await invoke(clerk,input);
  allowed(result);
  assert.equal(receiverCalls,1);
  assert.match(result.body.driveId,/^TEST_DRIVE_[A-Z0-9]{24}$/);
  assert.equal(result.body.duplicate,false);
  const first=(await docs.doc(docId).get()).data();
  assert.equal(first.files.length,1);
  assert.equal(first.fileVersions[0].files.length,1);
  assert.equal(first.files[0].name,input.fileName);
  assert.match(first.files[0].sha256,/^[a-f0-9]{64}$/);
  assert.equal(first.files[0].driveId,result.body.driveId);
  assert.equal(first.history.length,1);
  assert.equal("uploadSecret" in first.files[0],false);
  assert.equal("base64" in first.files[0],false);
  const receipt=await db.doc(ROOT+"bhs_secure_upload_receipts/"+uploadId).get();
  assert.equal(receipt.exists,true);
  assert.equal(receipt.data().docId,docId);
  result=await invoke(clerk,input);
  allowed(result);
  assert.equal(result.body.duplicate,true);
  assert.equal(receiverCalls,1,"Idempotent replay must not call transport again");
  denied(await invoke(clerk,{...input,fileName:"another.pdf",
    base64:Buffer.from("%PDF-other").toString("base64")}),400);
  await docs.doc(docId).update({status:"รอผู้อำนวยการ"});
  denied(await invoke(clerk,{...input,uploadId:randomUUID()}),403);
  assert.equal(receiverCalls,1);
  assert.equal((await docs.doc(docId).get()).data().files.length,1);
  assert.ok((await db.collection(ROOT+"bhs_audit_logs").get()).size>=1);
  console.log("PASS: verified real PDF bytes, role-limited server upload,"+
    " private fake GAS secret, atomic file receipt and replay safety");
}finally{
  await new Promise(resolve=>localGas.close(resolve));
  await deleteApp(app);
  for(const [key,value] of Object.entries(previous)){
    if(value===undefined)delete process.env[key];
    else process.env[key]=value;
  }
}
