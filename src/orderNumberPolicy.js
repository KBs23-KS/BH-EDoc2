export const parseRegisterNumber=value=>{
  const m=/^([1-9]\d{0,8})\/(2[5-9]\d{2})$/.exec(String(value||"").trim());
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
