export const parseRegisterNumber=value=>{
  const m=/^(0*[1-9]\d{0,8})\/(2[5-9]\d{2})$/.exec(String(value||"").trim());
  return m?{sequence:Number(m[1]),year:Number(m[2]),text:`${Number(m[1])}/${m[2]}`}:null;
};
export const visibleReservation=r=>Boolean(r&&r.status!=="canceled"&&!r.trialArchived);
export const visibleDocument=d=>Boolean(d&&!d.isDeleted&&!d.trialArchived);
export function occupiedRegisterNumbers(kind,reservations=[],documents=[],exceptReservationId=null){
  const field=kind==="ORDER"?"orderNumber":"docNumber";
  const type=kind==="ORDER"?"คำสั่งโรงเรียน":"หนังสือออก";
  const except=new Set(reservations.filter(r=>r.id===exceptReservationId).map(r=>r.linkedDocumentId).filter(Boolean));
  const used=new Set();
  for(const r of reservations)if(r.id!==exceptReservationId&&visibleReservation(r)){
    const num=parseRegisterNumber(r[field]);if(num)used.add(num.text);
  }
  for(const d of documents)if(d.type===type&&visibleDocument(d)&&d.reservationId!==exceptReservationId&&!except.has(d.id)){
    const num=parseRegisterNumber(d.docNumber);if(num)used.add(num.text);
  }
  return used;
}
export function nextAvailableNumber(start,year,occupied){
  for(let n=Math.max(1,Number(start)||1);n<=999999999;n++){
    const text=`${n}/${year}`;if(!occupied.has(text))return {sequence:n,text};
  }
  throw Error("เลขทะเบียนเกินขอบเขตที่กำหนด");
}
export function checkLinkedOrder(res,doc){
  if(!res?.linkedDocumentId)return "";
  if(!doc||doc.id!==res.linkedDocumentId||doc.reservationId!==res.id||doc.type!=="คำสั่งโรงเรียน"||doc.docNumber!==res.orderNumber)
    return "เลขคำสั่งกับเอกสารที่เชื่อมไม่ตรงกัน กรุณาตรวจสอบก่อนแก้ไขหรือลบ";
  return "";
}
export const registerCounterStamp=data=>JSON.stringify([Number(data?.lastNumber)||0,Number(data?.updatedAt)||0,Number(data?.revision)||0]);

/** Incoming book numbers are unique among active incoming letters within the same Buddhist year. */
export const incomingDocumentYear = date => {
  const raw=Number(String(date||"").slice(0,4));
  return raw>=2400&&raw<=2999?raw:raw>=1900&&raw<2400?raw+543:0;
};
export const normalizeIncomingNumber = number => {
  const raw=String(number||"").replace(/\\s+/g,"").trim();
  const parsed=parseRegisterNumber(raw);
  return parsed?.text||raw.toLocaleLowerCase("th-TH");
};
export function incomingNumberConflict(documents,number,date,exceptId="") {
  const key=normalizeIncomingNumber(number),year=incomingDocumentYear(date);
  if(!key||!year)return null;
  return (documents||[]).find(d=>d.id!==exceptId&&d.type==="หนังสือเข้า"&&visibleDocument(d)&&incomingDocumentYear(d.date)===year&&normalizeIncomingNumber(d.docNumber)===key)||null;
}
export const canManageDocument = (user,record) => Boolean(
  user?.role==="admin" || (user?.role==="clerk"&&record?.type==="หนังสือเข้า")
);
