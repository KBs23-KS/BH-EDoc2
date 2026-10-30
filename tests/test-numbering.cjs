const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const {join}=require("node:path");
const source=fs.readFileSync(join(__dirname,"../src/App.jsx"),"utf8");
const start=source.indexOf("async function reserveSequentialNumber("),end=source.indexOf("\nfunction PageNavigator(",start);
if(start<0||end<0)throw new Error("Allocator not found");
(async()=>{
  const {occupiedRegisterNumbers,nextAvailableNumber,registerCounterStamp}=await import("../src/orderNumberPolicy.js");
  const db=new Map();let id=0;
  const coll=name=>name,ref=(name,key)=>({id:key,key:name+"/"+key});
  const snap=value=>({exists:()=>value!==undefined,data:()=>value});
  const snapshotCol=name=>({docs:[...db].filter(([key])=>key.startsWith(name+"/")).map(([key,item])=>({id:key.slice(name.length+1),data:()=>item}))});
  const api={
    db:{},COUNTERS_PATH:"counter",AUDIT_LOG_PATH:"audit",DOCS_PATH:"docs",
    buddhistYear:iso=>Number(iso.slice(0,4))+543,
    getCollectionRef:coll,getDocumentRef:ref,uniqueId:prefix=>prefix+"-uuid-"+(++id),
    doc:name=>ref(name,"log"+(++id)),auditPayload:()=>({action:"test"}),
    getDocFromServer:async r=>snap(db.get(r.key)),
    getDocsFromServer:async name=>snapshotCol(name),
    occupiedRegisterNumbers,nextAvailableNumber,registerCounterStamp,
    runTransaction:async(_,fn)=>{
      const writes=[];
      const tx={get:async r=>snap(db.get(r.key)),set:(r,data,{merge}={})=>writes.push([r.key,merge?{...(db.get(r.key)||{}),...data}:data])};
      const result=await fn(tx);
      for(const [key,value]of writes)db.set(key,value);
      return result;
    }
  };
  const reserve=vm.runInNewContext(source.slice(start,end)+"\nreserveSequentialNumber",api);
  const user={id:"u1",name:"test"};
  const book=(kind,col,field,dateField,date)=>reserve({kind,collectionName:col,numberField:field,dateField,dateValue:date,user,data:{subject:"test"}});
  db.set("orders/visible",{orderNumber:"1/2569",status:"reserved"});
  db.set("orders/canceled",{orderNumber:"2/2569",status:"canceled"});
  db.set("orders/archived",{orderNumber:"3/2569",status:"linked",trialArchived:true});
  assert.equal(await book("ORDER","orders","orderNumber","orderDate","2026-10-30"),"2/2569");
  assert.equal(await book("ORDER","orders","orderNumber","orderDate","2026-10-30"),"3/2569");
  assert.equal(await book("OUT","outgoing","docNumber","docDate","2026-10-30"),"1/2569");
  assert.equal(await book("ORDER","orders","orderNumber","orderDate","2027-01-01"),"1/2570");
  // Admin rewinds cursor. Canceled/archived numbers do not block, visible do.
  db.set("counter/ORDER-2569",{lastNumber:0,year:2569,revision:90,updatedAt:202600});
  assert.equal(await book("ORDER","orders","orderNumber","orderDate","2026-10-30"),"4/2569");
  // Historical canceled number 10 is usable after cursor is manually set to 10.
  db.set("orders/old10",{orderNumber:"10/2569",status:"canceled"});
  db.set("counter/ORDER-2569",{lastNumber:9,year:2569,revision:95,updatedAt:202700});
  assert.equal(await book("ORDER","orders","orderNumber","orderDate","2026-10-30"),"10/2569");
  // Live signed document outside the reservations table also blocks duplicate use.
  db.set("docs/d11",{type:"คำสั่งโรงเรียน",docNumber:"11/2569"});
  db.set("counter/ORDER-2569",{lastNumber:10,year:2569,revision:99,updatedAt:202800});
  assert.equal(await book("ORDER","orders","orderNumber","orderDate","2026-10-30"),"12/2569");
  console.log("Numbering: active-only uniqueness, historical reuse, signed documents, yearly isolation PASS");
})().catch(e=>{console.error(e);process.exitCode=1});
