const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const script=fs.readFileSync(new URL("../gas/Code.gs","file://"+__filename),"utf8");
const folder="folder-1", good="strong-secret-longer-than-32-characters-for-test";
const store={BHS_DRIVE_FOLDER_ID:folder,BHS_BACKUP_SECRET:good};
let reads=0,uploads=0,shares=0;
const makeResponse=text=>({setMimeType(){return this},getContent(){return text},text});
const mocks={
  PropertiesService:{getScriptProperties:()=>({getProperty:name=>store[name],setProperty:(name,val)=>{store[name]=val;}})},
  ContentService:{MimeType:{JSON:"json",TEXT:"text"},createTextOutput:makeResponse},
  Utilities:{getUuid:()=>"12345678-1234-1234-1234-123456789abc",
    base64Decode:s=>Buffer.from(s,"base64"),base64Encode:bytes=>Buffer.from(bytes).toString("base64"),
    newBlob:(bytes,mime,name)=>({bytes,mime,name,getContentType:()=>mime,getBytes:()=>bytes})},
  DriveApp:{Access:{ANYONE_WITH_LINK:"anyone"},Permission:{VIEW:"view"},getFiles:()=>[],
    getFolderById:id=>{assert.equal(id,folder);return {createFile:blob=>{uploads++;return {getId:()=>"new",getUrl:()=>"url",getName:()=>blob.name,getSize:()=>blob.bytes.length,setSharing:()=>shares++}}}},
    getFileById:id=>{reads++;return {getParents:()=>{let vals=[{getId:()=>id==="inside"?folder:"outside"}];return {hasNext:()=>vals.length>0,next:()=>vals.shift()}},getBlob:()=>({getBytes:()=>Buffer.from("PDF"),getContentType:()=>"application/pdf"}),getName:()=>"school.pdf"}}}
};
vm.createContext(mocks);vm.runInContext(script,mocks);
const call=x=>JSON.parse(mocks.doPost({postData:{contents:JSON.stringify(x)}}).text);
assert.equal(call({action:"getFile",fileId:"inside"}).success,false);
assert.equal(reads,0,"read guard before Drive lookup");
assert.equal(call({action:"getFile",fileId:"inside",backupSecret:"wrong"}).success,false);
assert.equal(reads,0);
assert.equal(call({action:"getFile",fileId:"outside",backupSecret:good}).success,false);
assert.equal(call({action:"getFile",fileId:"inside",backupSecret:good}).base64,Buffer.from("PDF").toString("base64"));
assert.equal(call({fileName:"sample.pdf",mimeType:"application/pdf",base64:Buffer.from("hello").toString("base64")}).success,true);
assert.equal(uploads,1);
assert.equal(shares,1);
assert.equal(call({action:"unknown"}).success,false);
console.log("Protected GAS getFile and legacy upload compatibility: passed");
