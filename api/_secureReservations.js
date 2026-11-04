/**
 * ISOLATED BHS Firestore Emulator ONLY — school order/outgoing register.
 * Server assigns numbers. No PDFs, signing, Drive, or admin number overrides.
 * The exact current account is rechecked in each atomic transaction.
 */
import {randomBytes,randomUUID} from "node:crypto";
import {
  parseRegisterNumber,occupiedRegisterNumbers,nextAvailableNumber
} from "../src/orderNumberPolicy.js";
import {assertCredentialVaultBoundary} from "./_schoolCredentialVault.js";
const ROOT="artifacts/bhs-edoc-app/public/data/";
const UID=/^TEST_[A-Za-z0-9_-]{1,120}$/;
const RES_ID=/^TEST_RES_[A-F0-9]{24}$/;
const KINDS={
  ORDER:{collection:"bhs_order_reservations",field:"orderNumber",dateField:"orderDate"},
  OUT:{collection:"bhs_outgoing_reservations",field:"docNumber",dateField:"docDate"}
};
const reject=(status,code)=>Object.assign(new Error(code),{status,code});
const DETAILS=new Set(["subject","responsibleDept","remark","date"]);
function validated(form){
  if(!form||typeof form!=="object"||Array.isArray(form)||
     Object.keys(form).some(k=>!DETAILS.has(k))||
     typeof form.subject!=="string"||!form.subject.trim()||form.subject.length>240||
     typeof form.responsibleDept!=="string"||!form.responsibleDept.trim()||
     form.responsibleDept.length>120||
     typeof form.remark!=="string"||form.remark.length>1000||
     typeof form.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(form.date))
    throw reject(400,"invalid_reservation_metadata");
  const date=new Date(form.date+"T00:00:00Z");
  if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==form.date)
    throw reject(400,"invalid_register_date");
  const greg=Number(form.date.slice(0,4));
  if(greg<1900||greg>2399)throw reject(400,"invalid_year");
  const year=greg+543;
  if(year<2500||year>2999)throw reject(400,"invalid_register_year");
  return {
    subject:form.subject.trim(),responsibleDept:form.responsibleDept.trim(),
    remark:form.remark.trim(),date:form.date,year
  };
}
export async function manageSyntheticReservation({
  db,projectId,actorId,kind,action,reservationId,form={},env=process.env
}){
  assertCredentialVaultBoundary({projectId,env});
  if(!UID.test(actorId||"")||!KINDS[kind]||
     !["create","edit","cancel"].includes(action)||
     (action!=="create"&&!RES_ID.test(reservationId||"")))
    throw reject(400,"invalid_reservation_request");
  const kindSpec=KINDS[kind];
  const fields=action==="cancel"?null:validated(form);
  const id=action==="create"?"TEST_RES_"+randomBytes(12).toString("hex").toUpperCase():
    reservationId;
  return db.runTransaction(async tx=>{
    const users=db.collection(ROOT+"bhs_users");
    const reservations=db.collection(ROOT+kindSpec.collection);
    const documents=db.collection(ROOT+"bhs_documents");
    const audit=db.collection(ROOT+"bhs_audit_logs");
    const actorRef=users.doc(actorId),rowRef=reservations.doc(id);
    const counterRef=fields?
      db.doc(ROOT+"bhs_number_counters/"+kind+"-"+fields.year):null;
    // Reads before any writes, in one transaction.
    const [account,row,allReservations,allDocuments,counter]=await Promise.all([
      tx.get(actorRef),tx.get(rowRef),tx.get(reservations),tx.get(documents),
      counterRef?tx.get(counterRef):Promise.resolve(null)
    ]);
    const user=account.exists?account.data():null;
    if(!user||user.status!=="active"||
       !["admin","clerk","teacher"].includes(user.role))
      throw reject(403,"role_denied");
    const previous=row.exists?row.data():null;
    if(action==="create"&&previous)throw reject(409,"reservation_exists");
    if(action!=="create"&&!previous)throw reject(404,"reservation_missing");
    if(action!=="create"){
      if(user.role!=="admin"&&previous.createdBy!==actorId)
        throw reject(403,"not_reservation_owner");
      if(previous.status==="canceled"||previous.trialArchived||
         previous.linkedDocumentId)
        throw reject(403,"reservation_locked");
      // No implicit renumbering through an ordinary edit.
      if(action==="edit"&&
         fields.year!==parseRegisterNumber(previous[kindSpec.field])?.year)
        throw reject(400,"year_change_requires_separate_admin_action");
    }
    const now=Date.now();
    let number=previous?.[kindSpec.field];
    let newDoc;
    if(action==="create"){
      const used=occupiedRegisterNumbers(kind,
        allReservations.docs.map(x=>({id:x.id,...x.data()})),
        allDocuments.docs.map(x=>({id:x.id,...x.data()})));
      const start=counter.exists?Number(counter.data().lastNumber||0)+1:1;
      const next=nextAvailableNumber(start,fields.year,used);
      number=next.text;
      newDoc={
        [kindSpec.field]:number,[kindSpec.dateField]:fields.date,
        subject:fields.subject,responsibleDept:fields.responsibleDept,
        remark:fields.remark,status:"reserved",createdBy:actorId,
        responsibleName:user.name||"ผู้ใช้จำลอง",createdAt:now,
        history:[{action:"จองเลข",by:actorId,time:now,subject:fields.subject}],
        attachedFiles:[],linkedDocumentId:null
      };
      tx.create(rowRef,newDoc);
      tx.set(counterRef,{
        kind,year:fields.year,lastNumber:next.sequence,
        revision:Number(counter.exists?counter.data().revision||0:0)+1,
        updatedAt:now
      },{merge:true});
    }else if(action==="edit"){
      tx.update(rowRef,{
        subject:fields.subject,responsibleDept:fields.responsibleDept,
        remark:fields.remark,updatedAt:now,updatedBy:actorId,
        history:[...(previous.history||[]),{
          action:"แก้ไขข้อมูลจองเลข",by:actorId,time:now,subject:fields.subject
        }]
      });
    }else{
      tx.update(rowRef,{
        status:"canceled",canceledBy:actorId,canceledAt:now,
        history:[...(previous.history||[]),{
          action:"ยกเลิกเลขจอง",by:actorId,time:now,
          subject:previous.subject||""
        }]
      });
    }
    // Canceled numbers are not automatically recycled: counter advances
    // monotonically, even if a reserved row is later canceled.
    const event=action==="create"?"ออกเลขอัตโนมัติ":action==="edit"?
      "แก้ไขข้อมูลจองเลข":"ยกเลิกเลขจอง";
    tx.create(audit.doc("TEST_AUDIT_"+randomUUID()),{
      action:event,userId:actorId,targetType:kind,targetId:id,
      timestamp:now,detail:"ข้อมูลทะเบียนจำลอง "+number
    });
    return {success:true,action,kind,reservationId:id,number};
  });
}
