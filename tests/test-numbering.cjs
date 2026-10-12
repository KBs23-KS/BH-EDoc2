const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(require('path').join(__dirname, '../src/App.jsx'), 'utf8');
const start = source.indexOf('async function reserveSequentialNumber(');
const end = source.indexOf('\nfunction PageNavigator(', start);
if(start<0||end<0)throw new Error('Numbering implementation not found');
const db = new Map();
const collection = name => name;
const ref = (name,id) => ({id,key:`${name}/${id}`});
let id=0;
const snapshot = item => ({ exists: () => item !== undefined, data: () => item });
const api = {
  db:{}, COUNTERS_PATH:'counter', AUDIT_LOG_PATH:'audit',
  buddhistYear: date => +date.slice(0,4) + 543,
  getNumberYear: value => +String(value||'').split('/')[1],
  getCollectionRef:collection,
  getDocumentRef:ref,
  doc: name=>ref(name,`log${++id}`),
  auditPayload:()=>({action:'test'}),
  getDoc: async r=>snapshot(db.get(r.key)),
  getDocs: async name => ({forEach:f=>{
    for(const [key,value] of db) if(key.startsWith(`${name}/`)) f({data:()=>value});
  }}),
  runTransaction: async (unused,fn) => {
    const pending=[];
    const tx={
      get:async r=>snapshot(db.get(r.key)),
      set:(r,x)=>pending.push([r.key,x]),
      update:(r,x)=>pending.push([r.key,{...(db.get(r.key)||{}),...x}])
    };
    const result=await fn(tx);
    for(const [key,value] of pending)db.set(key,value);
    return result;
  }
};
const reserve = vm.runInNewContext(source.slice(start,end) + '\nreserveSequentialNumber',api);
(async()=>{
  db.set('orders/old1',{orderNumber:'99/2569'});
  const user={id:'u1',name:'ครู ทดสอบ'};
  const book = (kind,collectionName,numberField,dateField,dateValue) => reserve({kind,collectionName,numberField,dateField,dateValue,user,data:{subject:'เรื่องใหม่'}});
  assert.equal(await book('ORDER','orders','orderNumber','orderDate','2026-10-12'),'100/2569');
  assert.equal(await book('ORDER','orders','orderNumber','orderDate','2026-10-12'),'101/2569');
  assert.equal(await book('ORDER','orders','orderNumber','orderDate','2027-01-01'),'1/2570');
  assert.equal(await book('OUT','outgoing','docNumber','docDate','2026-10-12'),'1/2569');
  db.set('orders/ORDER-2569-101',{...db.get('orders/ORDER-2569-101'),status:'canceled'});
  assert.equal(await book('ORDER','orders','orderNumber','orderDate','2026-10-12'),'102/2569');
  console.log('PASS: old baseline, sequential numbers, New Year reset, independent registries, canceled numbers skipped');
})().catch(e=>{console.error(e);process.exitCode=1});
