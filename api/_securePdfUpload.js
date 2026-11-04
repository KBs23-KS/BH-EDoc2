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
  // Validate actual PDF structure before reserving an upload attempt.
  const file=await validatePdfUpload({fileName,base64});
  const docRef=db.doc(ROOT+"bhs_documents/"+docId);
  const userRef=db.doc(ROOT+"bhs_users/"+actorId);
  const receiptRef=db.doc(ROOT+"bhs_secure_upload_receipts/"+uploadId);
  const receiptMatches=record=>record?.actorId===actorId&&
    record?.docId===docId&&record?.sha256===file.sha256 &&
    record?.name===file.fileName;
  const ensureAllowed=(actor,document)=>{
    if(!canAttach(actor,document))throw err(403,"incoming_upload_not_allowed");
  };

  // Step 1: atomically CLAIM the idempotency key before any network upload.
  // Concurrent calls with the same key must never both send a file to GAS.
  const claim=await db.runTransaction(async tx=>{
    const [actorSnap,docSnap,receiptSnap]=await Promise.all([
      tx.get(userRef),tx.get(docRef),tx.get(receiptRef)
    ]);
    ensureAllowed(actorSnap.exists?actorSnap.data():null,
      docSnap.exists?docSnap.data():null);
    if(receiptSnap.exists){
      const previous=receiptSnap.data();
      if(!receiptMatches(previous))throw err(409,"upload_id_conflict");
      if(previous.state==="complete"&&FILE_ID.test(previous.driveId||""))
        return {state:"complete",driveId:previous.driveId};
      if(previous.state==="stored"&&FILE_ID.test(previous.driveId||""))
        return {state:"stored",driveId:previous.driveId};
      throw err(409,"upload_pending_or_failed_use_new_id");
    }
    tx.create(receiptRef,{
      state:"pending",docId,actorId,sha256:file.sha256,
      name:file.fileName,createdAt:Date.now()
    });
    return {state:"new"};
  });
  if(claim.state==="complete")
    return {success:true,docId,uploadId,driveId:claim.driveId,duplicate:true};

  let driveId=claim.driveId||null;
  if(claim.state==="new"){
    // Step 2: send once to the private TEST transport. All failed deliveries
    // remain visibly marked and are never silently retried with this key.
    const safeStoredName=docId+"-"+randomUUID()+".pdf";
    try{
      const response=await deliver({
        base64:file.base64,fileName:safeStoredName,mimeType:"application/pdf"
      });
      if(!response?.success||!FILE_ID.test(response.fileId||""))
        throw err(502,"unverified_file_transport");
      driveId=response.fileId;
      // Persist transport receipt before attempting the document update.
      // If the document changes concurrently, the stored receipt provides a
      // deterministic reconciliation path without reuploading the PDF.
      await db.runTransaction(async tx=>{
        const snap=await tx.get(receiptRef);
        if(!snap.exists||!receiptMatches(snap.data())||
           snap.data().state!=="pending")
          throw err(409,"upload_receipt_changed");
        tx.update(receiptRef,{state:"stored",driveId,storedAt:Date.now()});
      });
    }catch(error){
      if(!driveId){
        await db.runTransaction(async tx=>{
          const snap=await tx.get(receiptRef);
          if(snap.exists&&receiptMatches(snap.data())&&
             snap.data().state==="pending")
            tx.update(receiptRef,{state:"failed",failedAt:Date.now()});
        }).catch(()=>{});
      }
      throw error;
    }
  }

  // Step 3: reconcile a previously stored file, or attach the new file.
  // This transaction also commits version history, receipt and Audit Log.
  const attached=await db.runTransaction(async tx=>{
    const [userSnap,docSnap,receiptSnap]=await Promise.all([
      tx.get(userRef),tx.get(docRef),tx.get(receiptRef)
    ]);
    ensureAllowed(userSnap.exists?userSnap.data():null,
      docSnap.exists?docSnap.data():null);
    const receipt=receiptSnap.exists?receiptSnap.data():null;
    if(!receiptMatches(receipt)||receipt.driveId!==driveId)
      throw err(409,"stored_receipt_mismatch");
    if(receipt.state==="complete")
      return {driveId,duplicate:true};
    if(receipt.state!=="stored")
      throw err(409,"upload_not_stored");
    const doc=docSnap.data();
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
    tx.update(receiptRef,{state:"complete",completedAt:at});
    tx.create(db.collection(ROOT+"bhs_audit_logs").doc("TEST_AUDIT_"+randomUUID()),{
      action:event.action,userId:actorId,targetType:"DOCUMENT",
      targetId:docId,timestamp:at,detail:"PDF validated server-side"
    });
    return {driveId,duplicate:false};
  });
  return {success:true,docId,uploadId,
    driveId:attached.driveId,duplicate:attached.duplicate};
}
