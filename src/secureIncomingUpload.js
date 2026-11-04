/**
 * Client-side orchestration for the isolated BHS school incoming-PDF
 * rehearsal. Does not write Firestore, call GAS or handle any credentials.
 * Signed documents/orders are not supported by this boundary.
 */
const MAX_PDF_BYTES=3*1024*1024;
const DOC_ID=/^TEST_DOC_[A-F0-9]{24}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateSecureIncomingFiles(files){
  if(!Array.isArray(files)||files.length>10)
    throw new Error("โหมดทดสอบแนบ PDF ได้ไม่เกิน 10 ไฟล์ต่อครั้ง");
  for(const file of files){
    if(!file||typeof file.name!=="string"||
       !/\.pdf$/i.test(file.name)||file.name.length>180||
       /[/\\<>:"|?*\x00-\x1f]/.test(file.name)||
       file.type!=="application/pdf"||
       !Number.isFinite(file.size)||file.size<20||
       file.size>MAX_PDF_BYTES)
      throw new Error("รองรับเฉพาะ PDF ไม่เกิน 3 MB ต่อไฟล์ในโหมดทดสอบ");
  }
}
export async function uploadSecureIncomingFiles({
  docId,files,storage,fetcher,encode,idFactory,onProgress=()=>{}
}){
  if(!DOC_ID.test(docId||"")||typeof fetcher!=="function"||
     typeof encode!=="function"||typeof idFactory!=="function"||
     !storage||typeof storage.getItem!=="function"||
     typeof storage.setItem!=="function")
    throw new Error("ข้อมูลการแนบ PDF ไม่ครบ");
  validateSecureIncomingFiles(files);
  const results=[];
  for(let index=0;index<files.length;index++){
    const file=files[index];
    const receiptKey="bhs-secure-pdf:"+docId+":"+
      encodeURIComponent(JSON.stringify([
        index,file.name,file.size,file.lastModified||0
      ]));
    let uploadId=storage.getItem(receiptKey);
    if(!UUID.test(uploadId||"")){
      uploadId=idFactory();
      if(!UUID.test(uploadId||""))throw new Error("ไม่สามารถสร้างหมายเลขอัปโหลด");
      storage.setItem(receiptKey,uploadId);
    }
    onProgress("ตรวจสอบ PDF และแนบไฟล์ "+(index+1)+"/"+files.length);
    const base64DataUrl=await encode(file);
    const base64=String(base64DataUrl||"").split(",")[1];
    if(!base64||base64.length>Math.ceil(MAX_PDF_BYTES/3)*4+4)
      throw new Error("ไฟล์ PDF ไม่ถูกต้องหรือใหญ่เกินกำหนด");
    const response=await fetcher("/api/secure-upload",{
      method:"POST",credentials:"same-origin",cache:"no-store",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        docId,uploadId,fileName:file.name,base64
      })
    });
    if(!response.ok)
      throw new Error("แนบ PDF ไฟล์ที่ "+(index+1)+
        " ไม่สำเร็จ สามารถลองส่งซ้ำด้วยหมายเลขอัปโหลดเดิมได้");
    const result=await response.json();
    if(result?.success!==true||result.docId!==docId||
       result.uploadId!==uploadId||
       !/^TEST_DRIVE_[A-Z0-9]{12,72}$/.test(result.driveId||""))
      throw new Error("เซิร์ฟเวอร์ไม่ยืนยันไฟล์ PDF ที่อัปโหลด");
    results.push(result);
  }
  return results;
}
