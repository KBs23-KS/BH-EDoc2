/**
 * ISOLATED EMULATOR ONLY — trusted incoming PDF attachment boundary.
 *
 * Parse the actual PDF on the SERVER. Only the server can request upload
 * through a separate secret-gated transport. The client cannot provide any
 * Drive file ID, file URL, SHA, signed PDF status or document revision.
 *
 * The production PDF/Drive release is NOT implemented here. Tests inject a
 * mock transport; never connect to the deployed school's Apps Script.
 */
import {createHash,randomUUID} from "node:crypto";
import {PDFDocument} from "pdf-lib";
import {assertCredentialVaultBoundary} from "./_schoolCredentialVault.js";

const ROOT="artifacts/bhs-edoc-app/public/data/";
const DOC=/^TEST_DOC_[A-F0-9]{24}$/;
const UID=/^TEST_[A-Za-z0-9_-]{1,120}$/;
const FILE_ID=/^TEST_DRIVE_[A-Z0-9]{12,72}$/;
const UPLOAD_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES=3*1024*1024;
const err=(status,code)=>Object.assign(new Error(code),{status,code});

function canAttach(actor,doc){
  return actor?.status==="active"&&
    ["admin","clerk"].includes(actor.role)&&
    doc?.type==="หนังสือเข้า"&&!doc.isDeleted&&!doc.trialArchived&&
    doc.status==="รอรองผู้อำนวยการ";
}
export async function validatePdfUpload({fileName,base64}){
  if(typeof fileName!=="string"||fileName.length>180||
     !fileName.trim()||fileName==="."||fileName===".."||
     !/\.pdf$/i.test(fileName)||
     /[\/\\<>:"|?*\x00-\x1f]/.test(fileName))
    throw err(400,"unsafe_pdf_filename");
  if(typeof base64!=="string"||base64.length>Math.ceil(MAX_BYTES/3)*4+4||
     base64.length<20||base64.length%4!==0||
     !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
    throw err(400,"unsafe_pdf_base64");
  const bytes=Buffer.from(base64,"base64");
  if(bytes.length<20||bytes.length>MAX_BYTES||
     bytes.subarray(0,8).toString("latin1").startsWith("%PDF-")===false)
    throw err(400,"not_a_valid_pdf");
  let document;
  try{document=await PDFDocument.load(bytes,{ignoreEncryption:false});}
  catch{throw err(400,"invalid_pdf_structure");}
  const pages=document.getPageCount();
  if(pages<1||pages>200)throw err(400,"invalid_pdf_page_count");
  return {
    base64,fileName:fileName.trim(),size:bytes.length,pages,
    sha256:createHash("sha256").update(bytes).digest("hex")
  };
}
export async function addSyntheticIncomingPdf({
  db,projectId,actorId,docId,uploadId,fileName,base64,
  deliver,env=process.env
}){
  assertCredentialVaultBoundary({projectId,env});
  if(!UID.test(actorId||"")||!DOC.test(docId||"")||
     !UPLOAD_ID.test(uploadId||"")||typeof deliver!=="function")
    throw err(400,"invalid_upload_request");
  const file=await validatePdfUpload({fileName,base64});
  const docRef=db.doc(ROOT+"bhs_documents/"+docId);
  const userRef=db.doc(ROOT+"bhs_users/"+actorId);
  const receiptRef=db.doc(ROOT+"bhs_secure_upload_receipts/"+uploadId);
  const [actorSnap,docSnap,priorReceipt]=await Promise.all([
    userRef.get(),docRef.get(),receiptRef.get()
  ]);
  const actor=actorSnap.exists?actorSnap.data():null;
  const document=docSnap.exists?docSnap.data():null;
  if(!canAttach(actor,document))throw err(403,"incoming_upload_not_allowed");
  if(priorReceipt.exists){
    const record=priorReceipt.data();
    if(record.actorId!==actorId||record.docId!==docId||
       record.sha256!==file.sha256)throw err(409,"upload_id_conflict");
    return {success:true,docId,uploadId,driveId:record.driveId,
      duplicate:true};
  }
  // Randomized generated filename avoids path traversal and same-name
  // collisions in the Drive folder. Never trust the caller's Drive ID.
  const safeStoredName=docId+"-"+randomUUID()+".pdf";
  const delivered=await deliver({
    base64:file.base64,fileName:safeStoredName,mimeType:"application/pdf"
  });
  if(!delivered?.success||!FILE_ID.test(delivered.fileId||""))
    throw err(502,"unverified_file_transport");
  const driveId=delivered.fileId;
  const recorded=await db.runTransaction(async tx=>{
    const [userSnap,currentDoc,receiptSnap]=await Promise.all([
      tx.get(userRef),tx.get(docRef),tx.get(receiptRef)
    ]);
    if(!userSnap.exists||!currentDoc.exists||
       !canAttach(userSnap.data(),currentDoc.data()))
      throw err(403,"document_changed_during_upload");
    if(receiptSnap.exists){
      const existing=receiptSnap.data();
      if(existing.actorId!==actorId||existing.docId!==docId||
         existing.sha256!==file.sha256)throw err(409,"upload_id_conflict");
      return existing.driveId;
    }
    const doc=currentDoc.data();
    if((doc.files||[]).some(x=>x.driveId===driveId))
      throw err(409,"duplicate_drive_file");
    const at=Date.now();
    const record={
      driveId,name:file.fileName,type:"PDF",mimeType:"application/pdf",
      size:(file.size/(1024*1024)).toFixed(2)+" MB",
      sha256:file.sha256,uploadedBy:actorId,uploadedAt:at
    };
    const oldVersions=Array.isArray(doc.fileVersions)?doc.fileVersions:[];
    const version=Number(doc.activeFileVersion)||1;
    const versions=oldVersions.length?oldVersions.map(v=>
      Number(v.version)===version?{
        ...v,files:[...(v.files||[]),record]
      }:v
    ):[{version:1,files:[record],timestamp:at,reason:"ฉบับแรก"}];
    const event={action:"แนบ PDF ที่ตรวจสอบโดยเซิร์ฟเวอร์",
      by:actorId,byName:userSnap.data().name||"บัญชีจำลอง",
      timestamp:at,detail:"PDF "+file.pages+" หน้า; SHA-256 บันทึกในไฟล์แนบ"};
    tx.update(docRef,{
      files:[...(doc.files||[]),record],
      fileVersions:versions,lastEventAt:at,
      history:[...(doc.history||[]),event]
    });
    tx.create(receiptRef,{
      docId,actorId,sha256:file.sha256,driveId,createdAt:at
    });
    tx.create(db.collection(ROOT+"bhs_audit_logs").doc("TEST_AUDIT_"+randomUUID()),{
      action:event.action,userId:actorId,targetType:"DOCUMENT",
      targetId:docId,timestamp:at,detail:"PDF validated server-side"
    });
    return driveId;
  });
  return {success:true,docId,uploadId,driveId:recorded,duplicate:false};
}
