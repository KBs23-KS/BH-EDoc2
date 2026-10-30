/** Pure safety checks for admin-only reversible archiving of trial order reservations.
 * Never consume/reuse numbers or silently delete signed/published documents.
 */
export const TRIAL_PENDING_STATUSES=new Set(["รอรองผู้อำนวยการ","รอผู้อำนวยการ","ส่งกลับแก้ไข"]);
export function canArchiveTrialOrder(res,linkedDoc){
  if(!res)return "ไม่พบรายการเลขคำสั่ง";
  if(res.trialArchived)return "รายการนี้จัดเก็บไว้แล้ว";
  if(res.status==="canceled")return "เลขที่ยกเลิกต้องจัดการผ่านประวัติการยกเลิก";
  if(!res.linkedDocumentId)return "";
  if(!linkedDoc)return "ไม่พบเอกสารคำสั่งที่เชื่อมกับเลขนี้";
  if(linkedDoc.id!==res.linkedDocumentId||linkedDoc.reservationId!==res.id||
     linkedDoc.type!=="คำสั่งโรงเรียน"||linkedDoc.docNumber!==res.orderNumber)
    return "ข้อมูลเลขคำสั่งกับเอกสารไม่ตรงกัน กรุณาตรวจสอบก่อน";
  if(linkedDoc.isDeleted)return "เอกสารนี้อยู่ในถังขยะอยู่แล้ว";
  if(!TRIAL_PENDING_STATUSES.has(linkedDoc.status))return "คำสั่งผ่านขั้นตอนอนุมัติหรือเผยแพร่แล้ว";
  if((linkedDoc.signedFiles||[]).length||linkedDoc.publishedAt||
     linkedDoc.directorCommand||(linkedDoc.acknowledgedBy||[]).length||
     (linkedDoc.routingEntries||[]).length||(linkedDoc.headActions||[]).length||
     (linkedDoc.assignmentAcknowledged||[]).length)
    return "คำสั่งนี้มีการลงนาม เผยแพร่ รับทราบ หรือมอบหมายงานแล้ว";
  return "";
}
export function canRestoreTrialOrder(res,linkedDoc){
  if(!res?.trialArchived)return "รายการนี้ไม่ได้อยู่ในที่จัดเก็บทดลอง";
  if(!res.linkedDocumentId)return "";
  if(!linkedDoc||linkedDoc.id!==res.linkedDocumentId||
     linkedDoc.reservationId!==res.id||linkedDoc.docNumber!==res.orderNumber||
     linkedDoc.type!=="คำสั่งโรงเรียน")return "เอกสารคำสั่งที่เชื่อมกันไม่ตรงกัน";
  if(!linkedDoc.trialArchived||!linkedDoc.isDeleted)
    return "สถานะเอกสารไม่ตรงกับรายการทดลองที่จัดเก็บไว้";
  if(!TRIAL_PENDING_STATUSES.has(linkedDoc.status)||(linkedDoc.signedFiles||[]).length||
     linkedDoc.publishedAt)return "ไม่อนุญาตกู้คืนคำสั่งที่อนุมัติหรือเผยแพร่แล้ว";
  return "";
}
