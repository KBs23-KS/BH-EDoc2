/**
 * ISOLATED FIRESTORE EMULATOR ONLY.
 * Transactional metadata operations on BHS-shaped incoming letters.
 *
 * PDF / Drive uploads, order reservations and authenticated file claims are
 * OUT OF SCOPE. This service rejects all browser-supplied files or signedFiles.
 * Never copy into the production school project without a staged cutover.
 */
import {randomBytes,randomUUID} from "node:crypto";
import {
  incomingDocumentYear,incomingNumberConflict,normalizeIncomingNumber
} from "../src/orderNumberPolicy.js";
import {assertCredentialVaultBoundary} from "./_schoolCredentialVault.js";

const ROOT="artifacts/bhs-edoc-app/public/data/";
const UID=/^TEST_[A-Za-z0-9_-]{1,120}$/;
const DOC_ID=/^TEST_DOC_[A-F0-9]{24}$/;
const URGENCY=new Set(["ปกติ","ด่วน","ด่วนมาก","ด่วนที่สุด"]);
const ALLOWED=new Set(["subject","docNumber","date","urgency","from"]);
const problem=(status,code)=>Object.assign(new Error(code),{status,code});
function inputFields(input){
  if(!input||typeof input!=="object"||Array.isArray(input)||
     Object.keys(input).some(k=>!ALLOWED.has(k))||
     typeof input.subject!=="string"||!input.subject.trim()||input.subject.length>240||
     typeof input.docNumber!=="string"||!input.docNumber.trim()||input.docNumber.length>80||
     typeof input.from!=="string"||!input.from.trim()||input.from.length>180||
     typeof input.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||
     !URGENCY.has(input.urgency))
    throw problem(400,"invalid_incoming_fields");
  const iso=new Date(input.date+"T00:00:00Z");
  if(Number.isNaN(iso.getTime())||iso.toISOString().slice(0,10)!==input.date)
    throw problem(400,"invalid_calendar_date");
  const year=incomingDocumentYear(input.date);
  if(year<2500||year>2999)throw problem(400,"invalid_register_year");
  return {subject:input.subject.trim(),docNumber:input.docNumber.trim(),
    date:input.date,urgency:input.urgency,from:input.from.trim(),year};
}
export async function manageSyntheticIncomingDocument({
  db,projectId,actorId,action,docId,form={},env=process.env
}){
  assertCredentialVaultBoundary({projectId,env});
  if(!UID.test(actorId||"")||
     !["create","edit","soft-delete","restore"].includes(action)||
     (action!=="create"&&!DOC_ID.test(docId||"")))
    throw problem(400,"invalid_test_document_request");

  const details=["soft-delete","restore"].includes(action)?null:inputFields(form);
  const id=action==="create"?"TEST_DOC_"+randomBytes(12).toString("hex").toUpperCase():docId;
  const result=await db.runTransaction(async tx=>{
    const users=db.collection(ROOT+"bhs_users");
    const docs=db.collection(ROOT+"bhs_documents");
    const audit=db.collection(ROOT+"bhs_audit_logs");
    const actorRef=users.doc(actorId),ref=docs.doc(id);
    // Always read the record before computing the year-locked restore counter.
    const documentSnap=await tx.get(ref);
    const prior=documentSnap.exists?documentSnap.data():null;
    const year=details?.year||(action==="restore"?
      incomingDocumentYear(prior?.date):null);
    const counterRef=year?
      db.doc(ROOT+"bhs_number_counters/INCOMING-"+year):null;
    // All reads precede all writes, including the year-specific lock.
    const [actorSnap,docsSnap,counterSnap]=await Promise.all([
      tx.get(actorRef),tx.get(docs),
      counterRef?tx.get(counterRef):Promise.resolve(null)
    ]);
    const actor=actorSnap.exists?actorSnap.data():null;
    if(!actor||actor.status!=="active"||
       !["admin","clerk"].includes(actor.role))
      throw problem(403,"incoming_clerk_or_admin_required");
    const previous=documentSnap.exists?documentSnap.data():null;
    if(action==="create"&&previous)throw problem(409,"document_conflict");
    if(action!=="create"&&!previous)throw problem(404,"document_missing");
    if(action==="restore"){
      if(actor.role!=="admin"||!previous.isDeleted||
         previous.trialArchived||previous.type!=="หนังสือเข้า"||
         year<2500||year>2999)throw problem(403,"cannot_restore_incoming");
      if(incomingNumberConflict(
        docsSnap.docs.map(d=>({id:d.id,...d.data()})),
        previous.docNumber,previous.date,id))
        throw problem(409,"restore_duplicate_number");
    }else if(previous&&(previous.isDeleted||previous.type!=="หนังสือเข้า")){
      throw problem(403,"cannot_edit_document");
    }
    if(details){
      const current=docsSnap.docs.map(d=>({id:d.id,...d.data()}));
      if(incomingNumberConflict(current,details.docNumber,details.date,id))
        throw problem(409,"duplicate_incoming_number");
    }
    const now=Date.now();
    const message=action==="create"?"ลงทะเบียนหนังสือเข้า":
      action==="edit"?"แก้ไขข้อมูลหนังสือเข้า":
      action==="restore"?"กู้คืนหนังสือเข้า":"ย้ายหนังสือเข้าลงถังขยะ";
    const history={
      action:message,by:actorId,byName:actor.name||"บัญชีจำลอง",
      role:actor.role,timestamp:now,detail:"การดำเนินการข้อมูลจำลอง"
    };
    if(action==="create"){
      tx.create(ref,{
        subject:details.subject,docNumber:details.docNumber,
        date:details.date,urgency:details.urgency,from:details.from,
        type:"หนังสือเข้า",department:"-",createdBy:actorId,
        createdAt:now,lastEventAt:now,
        status:"รอรองผู้อำนวยการ",files:[],signedFiles:[],
        fileVersions:[{version:1,files:[],timestamp:now,reason:"ฉบับแรก"}],
        activeFileVersion:1,acknowledgedBy:[],history:[history],
        routingEntries:[],headActions:[],recipientsSnapshot:[],
        isDeleted:false
      });
    }else if(action==="edit"){
      tx.update(ref,{
        subject:details.subject,docNumber:details.docNumber,date:details.date,
        urgency:details.urgency,from:details.from,lastEventAt:now,
        history:[...(previous.history||[]),history]
      });
    }else if(action==="restore"){
      tx.update(ref,{
        isDeleted:false,deletedAt:null,deletedBy:null,lastEventAt:now,
        history:[...(previous.history||[]),history]
      });
    }else{
      tx.update(ref,{
        isDeleted:true,deletedAt:now,deletedBy:actorId,lastEventAt:now,
        history:[...(previous.history||[]),history]
      });
    }
    if(counterRef){
      const currentRevision=Number(counterSnap.data()?.revision||0);
      tx.set(counterRef,{
        kind:"INCOMING",year,revision:currentRevision+1,
        updatedAt:now
      },{merge:true});
    }
    tx.create(audit.doc("TEST_AUDIT_"+randomUUID()),{
      action:message,userId:actorId,targetType:"DOCUMENT",targetId:id,
      timestamp:now,detail:"เฉพาะข้อมูลจำลอง"
    });
    return {success:true,action,docId:id};
  });
  return result;
}
