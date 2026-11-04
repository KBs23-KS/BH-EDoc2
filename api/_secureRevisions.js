/**
 * ISOLATED FIRESTORE EMULATOR ONLY.
 * Trusted PDF revisions for returned school documents. A staging receipt
 * never alters visible document files until the owner explicitly resubmits.
 * No actual Google Drive, school signature or production Firebase access.
 */
import {randomUUID} from "node:crypto";
import {assertCredentialVaultBoundary} from "./_schoolCredentialVault.js";
import {validatePdfUpload} from "./_securePdfUpload.js";

const ROOT="artifacts/bhs-edoc-app/public/data/";
const USER=/^TEST_[A-Za-z0-9_-]{1,120}$/;
const DOC=/^TEST_DOC_[A-F0-9]{24}$/;
const DRIVE=/^TEST_DRIVE_[A-Z0-9]{12,72}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PDF_TYPES=new Set(["หนังสือเข้า","คำสั่งโรงเรียน","หนังสือเวียนแจ้งรับทราบ"]);
const reject=(status,code)=>Object.assign(new Error(code),{status,code});
const isOwner=(actor,doc,uid)=>actor?.status==="active"&&
  doc?.status==="ส่งกลับแก้ไข"&&!doc.isDeleted&&!doc.trialArchived&&
  PDF_TYPES.has(doc.type)&&doc.createdBy===uid;
const receiptRef=(db,id)=>db.doc(ROOT+"bhs_secure_revision_receipts/"+id);
const actorRef=(db,id)=>db.doc(ROOT+"bhs_users/"+id);
const docRef=(db,id)=>db.doc(ROOT+"bhs_documents/"+id);

export async function stageSyntheticRevisionPdf({
  db,projectId,actorId,docId,uploadId,fileName,base64,deliver,
  env=process.env
}){
  assertCredentialVaultBoundary({projectId,env});
  if(!USER.test(actorId||"")||!DOC.test(docId||"")||
     !UUID.test(uploadId||"")||typeof deliver!=="function")
    throw reject(400,"invalid_revision_upload");
  const file=await validatePdfUpload({fileName,base64});
  const user=actorRef(db,actorId),document=docRef(db,docId),
    receipt=receiptRef(db,uploadId);
  const matching=r=>r?.actorId===actorId&&r.docId===docId&&
    r.sha256===file.sha256&&r.name===file.fileName&&
    r.purpose==="revision";
  const claim=await db.runTransaction(async tx=>{
    const [u,d,existing]=await Promise.all([
      tx.get(user),tx.get(document),tx.get(receipt)
    ]);
    if(!isOwner(u.exists?u.data():null,d.exists?d.data():null,actorId))
      throw reject(403,"not_returned_document_owner");
    if(existing.exists){
      const r=existing.data();
      if(!matching(r)||
         r.baseVersion!==(Number(d.data().activeFileVersion)||1))
        throw reject(409,"revision_id_reused_for_other_file");
      if(["ready","consumed"].includes(r.state)&&DRIVE.test(r.driveId||""))
        return {state:r.state,driveId:r.driveId};
      if(r.state==="stored"&&DRIVE.test(r.driveId||""))
        return {state:"stored",driveId:r.driveId};
      throw reject(409,"revision_upload_pending_or_failed");
    }
    tx.create(receipt,{state:"pending",purpose:"revision",
      docId,actorId,baseVersion:Number(d.data().activeFileVersion)||1,
      name:file.fileName,sha256:file.sha256,
      size:file.size,pages:file.pages,createdAt:Date.now()});
    return {state:"new"};
  });
  if(["ready","consumed"].includes(claim.state))
    return {success:true,uploadId,docId,duplicate:true};
  let driveId=claim.driveId||null;
  if(claim.state==="new"){
    try{
      const output=await deliver({
        fileName:docId+"-revision-"+randomUUID()+".pdf",
        base64:file.base64,mimeType:"application/pdf"
      });
      if(!output?.success||!DRIVE.test(output.fileId||""))
        throw reject(502,"revision_transport_failed");
      driveId=output.fileId;
      await db.runTransaction(async tx=>{
        const existing=await tx.get(receipt);
        if(!existing.exists||!matching(existing.data())||
           existing.data().state!=="pending")
          throw reject(409,"revision_receipt_changed");
        tx.update(receipt,{state:"stored",driveId,storedAt:Date.now()});
      });
    }catch(error){
      if(!driveId){
        await db.runTransaction(async tx=>{
          const existing=await tx.get(receipt);
          if(existing.exists&&matching(existing.data())&&
             existing.data().state==="pending")
            tx.update(receipt,{state:"failed",failedAt:Date.now()});
        }).catch(()=>{});
      }
      throw error;
    }
  }
  await db.runTransaction(async tx=>{
    const [u,d,existing]=await Promise.all([
      tx.get(user),tx.get(document),tx.get(receipt)
    ]);
    if(!isOwner(u.exists?u.data():null,d.exists?d.data():null,actorId))
      throw reject(403,"document_changed_during_revision");
    if(!existing.exists||!matching(existing.data())||
       existing.data().driveId!==driveId||
       existing.data().baseVersion!==(Number(d.data().activeFileVersion)||1))
      throw reject(409,"revision_receipt_mismatch");
    if(existing.data().state==="ready")return;
    if(existing.data().state!=="stored")
      throw reject(409,"revision_receipt_not_stored");
    tx.update(receipt,{state:"ready",readyAt:Date.now()});
  });
  return {success:true,uploadId,docId,duplicate:false};
}

export async function finalizeSyntheticRevision({
  db,projectId,actorId,docId,subject,uploadIds,env=process.env
}){
  assertCredentialVaultBoundary({projectId,env});
  if(!USER.test(actorId||"")||!DOC.test(docId||"")||
     typeof subject!=="string"||!subject.trim()||subject.length>240||
     !Array.isArray(uploadIds)||uploadIds.length<1||uploadIds.length>10||
     new Set(uploadIds).size!==uploadIds.length||
     uploadIds.some(id=>!UUID.test(id||"")))
    throw reject(400,"invalid_revision_submission");
  const user=actorRef(db,actorId),document=docRef(db,docId);
  return db.runTransaction(async tx=>{
    const receiptDocs=uploadIds.map(id=>receiptRef(db,id));
    const [u,d,...snapshots]=await Promise.all([
      tx.get(user),tx.get(document),
      ...receiptDocs.map(r=>tx.get(r))
    ]);
    const actor=u.exists?u.data():null,original=d.exists?d.data():null;
    if(!isOwner(actor,original,actorId))
      throw reject(403,"revision_not_permitted");
    const isSingle=original.type!=="หนังสือเข้า";
    if(isSingle&&uploadIds.length!==1)
      throw reject(400,"single_pdf_required");
    if(snapshots.some(s=>!s.exists||s.data()?.state!=="ready"||
        s.data()?.baseVersion!==(Number(original.activeFileVersion)||1)||
        s.data()?.purpose!=="revision"||
        s.data()?.docId!==docId||s.data()?.actorId!==actorId||
        !DRIVE.test(s.data()?.driveId||"")||
        !/^[a-f0-9]{64}$/.test(s.data()?.sha256||"")))
      throw reject(403,"untrusted_revision_receipt");
    const now=Date.now(),version=(Number(original.activeFileVersion)||1)+1;
    const files=snapshots.map(s=>{
      const f=s.data();return {
        driveId:f.driveId,name:f.name,type:"PDF",mimeType:"application/pdf",
        size:(f.size/(1024*1024)).toFixed(2)+" MB",sha256:f.sha256,
        uploadedBy:actorId,uploadedAt:f.readyAt||now
      };
    });
    const previous=Array.isArray(original.fileVersions)&&original.fileVersions.length?
      original.fileVersions:[{
        version:Number(original.activeFileVersion)||1,
        files:original.files||[],timestamp:original.createdAt||now,reason:"ฉบับเดิม"
      }];
    const event={action:"แก้ไขและส่งเรื่องใหม่",by:actorId,
      byName:actor.name||"บัญชีจำลอง",role:actor.role,timestamp:now,
      detail:"ส่งกลับเข้ากระบวนการอีกครั้ง (ฉบับที่ "+version+")"};
    tx.update(document,{
      subject:subject.trim(),files,
      fileVersions:[...previous,{
        version,files,timestamp:now,reason:"ส่งกลับแก้ไข"
      }],
      activeFileVersion:version,status:"รอรองผู้อำนวยการ",
      rejectReason:"",deputyComment:"",directorCommand:"",
      signedFiles:[],returnedAt:null,lastEventAt:now,
      history:[...(original.history||[]),event]
    });
    for(let i=0;i<receiptDocs.length;i++)
      tx.update(receiptDocs[i],{state:"consumed",usedAt:now,fileVersion:version});
    tx.create(db.collection(ROOT+"bhs_audit_logs").doc("TEST_AUDIT_"+randomUUID()),{
      action:event.action,userId:actorId,targetType:"DOCUMENT",targetId:docId,
      timestamp:now,detail:"ฉบับแก้ไขที่ "+version+" ผ่านการตรวจไฟล์จากเซิร์ฟเวอร์"
    });
    return {success:true,docId,activeFileVersion:version,
      status:"รอรองผู้อำนวยการ"};
  });
}
