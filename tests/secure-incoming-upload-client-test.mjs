/**
 * Offline browser upload helper regression using only synthetic PDF metadata.
 * No live browser, Firestore, Google Drive, HTTP or real school information.
 */
import assert from "node:assert/strict";
import {
  validateSecureIncomingFiles,uploadSecureIncomingFiles
} from "../src/secureIncomingUpload.js";

const docId="TEST_DOC_AABBCCDDEEFF001122334455";
const fakeFile=(name="test.pdf",type="application/pdf",size=350)=>({
  name,type,size,lastModified:1730760000000
});
const file=fakeFile();
assert.doesNotThrow(()=>validateSecureIncomingFiles([file]));
assert.doesNotThrow(()=>validateSecureIncomingFiles([
  fakeFile("ipad.pdf","",350)
]));
assert.throws(()=>validateSecureIncomingFiles([
  fakeFile("attack.pdf","application/pdf",3*1024*1024+1)
]),/PDF/);
assert.throws(()=>validateSecureIncomingFiles([
  fakeFile("../evil.pdf")
]),/PDF/);
assert.throws(()=>validateSecureIncomingFiles([
  fakeFile("image.png","image/png")
]),/PDF/);
assert.throws(()=>validateSecureIncomingFiles(new Array(11).fill(file)),/10/);

const memory=new Map(),storage={
  getItem:key=>memory.get(key)||null,
  setItem:(key,value)=>memory.set(key,value)
};
const requests=[];
let rejectFirst=true;
const fetcher=async(url,opts)=>{
  assert.equal(url,"/api/secure-upload");
  assert.equal(opts.method,"POST");
  assert.equal(opts.credentials,"same-origin");
  const body=JSON.parse(opts.body);
  assert.equal(body.docId,docId);
  assert.deepEqual(Object.keys(body).sort(),[
    "base64","docId","fileName","uploadId"
  ]);
  assert.equal(body.fileName,file.name);
  requests.push(body);
  if(rejectFirst){rejectFirst=false;return {ok:false,status:503};}
  return {
    ok:true,
    async json(){return {
      success:true,docId,uploadId:body.uploadId,
      driveId:"TEST_DRIVE_ABCDEF0123456789ABCDEF01",
      duplicate:requests.length>2
    }}
  };
};
const opts={
  docId,files:[file],storage,fetcher,
  encode:async()=> "data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK",
  idFactory:()=> "12345678-1234-4000-8000-123456789abc"
};
await assert.rejects(uploadSecureIncomingFiles(opts),/ไม่สำเร็จ/);
assert.equal(requests.length,1);
assert.equal(memory.size,1,"upload UUID persisted across retry");
const result=await uploadSecureIncomingFiles(opts);
assert.equal(result.length,1);
assert.equal(result[0].success,true);
assert.equal(requests.length,2);
assert.equal(requests[0].uploadId,requests[1].uploadId,
  "retry must use exact same server receipt; never create extra PDF");
assert.equal(JSON.stringify([...memory.values()]).includes("JVBER"),false,
  "do not cache PDF bytes or passwords in browser storage");
console.log("PASS: preview incoming PDF upload retry, original filename, iPad MIME and stable receipt");
