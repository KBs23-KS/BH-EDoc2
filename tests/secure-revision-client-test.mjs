/**
 * Offline returned-PDF form test; no Firebase, browser cookies or real Drive.
 */
import assert from "node:assert/strict";
import {resubmitSecureRevision} from "../src/secureRevisionUpload.js";
const docId="TEST_DOC_AABBCCDDEEFF001122334455";
const file={name:"rev.pdf",type:"application/pdf",size:350,lastModified:123};
const store=new Map(),storage={
  getItem:key=>store.get(key)||null,
  setItem:(key,value)=>store.set(key,value),
  removeItem:key=>store.delete(key)
};
const requests=[];
let firstFailure=true;
const fetcher=async(url,options)=>{
  assert.equal(url,"/api/secure-revision");
  assert.equal(options.method,"POST");
  assert.equal(options.credentials,"same-origin");
  const input=JSON.parse(options.body);
  requests.push(input);
  if(input.action==="stage"){
    if(firstFailure){firstFailure=false;return {ok:false,status:503};}
    return {ok:true,json:async()=>({
      success:true,uploadId:input.uploadId,docId,duplicate:false
    })};
  }
  assert.equal(input.action,"finalize");
  assert.equal(input.docId,docId);
  assert.deepEqual(input.uploadIds,[requests[1].uploadId]);
  return {ok:true,json:async()=>({
    success:true,docId,activeFileVersion:2,
    status:"รอรองผู้อำนวยการ"
  })};
};
const args={docId,subject:"เอกสารฉบับแก้ไข",files:[file],
  isSinglePdf:true,storage,fetcher,
  encode:async()=> "data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK",
  idFactory:()=> "12345678-1234-4000-8000-123456789abc"
};
await assert.rejects(resubmitSecureRevision(args),/ไม่สำเร็จ/);
assert.equal(store.size,1);
const result=await resubmitSecureRevision(args);
assert.equal(result.activeFileVersion,2);
assert.equal(requests.length,3);
assert.equal(requests[0].uploadId,requests[1].uploadId);
assert.equal(store.size,0,"Successful revision should clear stored UUID");
assert.ok(!requests.some(x=>x.signedFiles||x.role||x.status),
  "Browser cannot claim signer authority or forge status");
const attempts=requests.length;
await assert.rejects(resubmitSecureRevision({
  ...args,isSinglePdf:true,files:[file,file]
}),/PDF/);
assert.equal(requests.length,attempts);
console.log("PASS: secure returned-PDF form staging/retry/finalize with preserved receipt");
