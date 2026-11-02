import assert from "node:assert/strict";
import {parseRegisterNumber,visibleReservation,occupiedRegisterNumbers,nextAvailableNumber,checkLinkedOrder,registerCounterStamp,incomingNumberConflict,incomingDocumentYear,normalizeIncomingNumber,canManageDocument} from "../src/orderNumberPolicy.js";
assert.deepEqual(parseRegisterNumber("001/2569"),{sequence:1,year:2569,text:"1/2569"});
assert.equal(parseRegisterNumber("0/2569"),null);
assert.equal(parseRegisterNumber("1/2026"),null);
assert.equal(visibleReservation({status:"canceled"}),false);
const a={id:"a",orderNumber:"1/2569",status:"linked",linkedDocumentId:"docA"};
const d={id:"docA",reservationId:"a",docNumber:"1/2569",type:"คำสั่งโรงเรียน"};
const occupied=occupiedRegisterNumbers("ORDER",[a,{id:"old",orderNumber:"2/2569",status:"canceled"},{id:"archive",orderNumber:"3/2569",trialArchived:true}],[d,{id:"deleted",type:"คำสั่งโรงเรียน",docNumber:"4/2569",isDeleted:true}]);
assert.deepEqual([...occupied],["1/2569"]);
assert.deepEqual(nextAvailableNumber(1,2569,occupied),{sequence:2,text:"2/2569"});
assert.equal(occupiedRegisterNumbers("ORDER",[a],[d],"a").size,0);
assert.equal(checkLinkedOrder(a,d),"");
assert.match(checkLinkedOrder(a,{...d,docNumber:"7/2569"}),/ไม่ตรงกัน/);
assert.match(checkLinkedOrder(a,null),/ไม่ตรงกัน/);
assert.notEqual(registerCounterStamp({lastNumber:1,revision:1}),registerCounterStamp({lastNumber:1,revision:2}));
console.log("Visible-only numbering, history reuse and linked-document checks passed");


assert.equal(incomingDocumentYear("2026-11-02"),2569);
assert.equal(incomingDocumentYear("2569-11-02"),2569);
assert.equal(normalizeIncomingNumber(" 001 / 2569 "), "1/2569");
const incoming=[
  {id:"i1",type:"หนังสือเข้า",docNumber:"001/2569",date:"2026-10-01"},
  {id:"i2",type:"หนังสือเข้า",docNumber:"2/2569",date:"2026-10-01",isDeleted:true},
  {id:"o1",type:"คำสั่งโรงเรียน",docNumber:"3/2569",date:"2026-10-01"},
  {id:"i3",type:"หนังสือเข้า",docNumber:"4/2568",date:"2025-10-01"}
];
assert.equal(incomingNumberConflict(incoming,"1/2569","2026-11-02")?.id,"i1");
assert.equal(incomingNumberConflict(incoming,"1/2569","2026-11-02","i1"),null);
assert.equal(incomingNumberConflict(incoming,"2/2569","2026-11-02"),null);
assert.equal(incomingNumberConflict(incoming,"3/2569","2026-11-02"),null);
assert.equal(incomingNumberConflict(incoming,"4/2568","2026-11-02"),null);
assert.equal(canManageDocument({role:"clerk"},{type:"หนังสือเข้า"}),true);
assert.equal(canManageDocument({role:"clerk"},{type:"คำสั่งโรงเรียน"}),false);
assert.equal(canManageDocument({role:"clerk"},{type:"หนังสือเวียนแจ้งรับทราบ"}),false);
assert.equal(canManageDocument({role:"teacher"},{type:"หนังสือเข้า"}),false);
assert.equal(canManageDocument({role:"admin"},{type:"คำสั่งโรงเรียน"}),true);
console.log("Clerk incoming scope and yearly duplicate-number policy passed");
