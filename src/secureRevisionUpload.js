/**
 * Isolated BHS revision form helper. The original PDF and old document
 * revision remain untouched until the server commits all staged file receipts.
 * The browser has NO Firestore writes or private GAS credentials.
 */
import {validateSecureIncomingFiles} from "./secureIncomingUpload.js";
const ID=/^TEST_DOC_[A-F0-9]{24}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function resubmitSecureRevision({
  docId,subject,files,isSinglePdf,storage,fetcher,encode,idFactory,
  onProgress=()=>{}
}){
  if(!ID.test(docId||"")||typeof subject!=="string"||
     !subject.trim()||subject.length>240||
     typeof fetcher!=="function"||typeof encode!=="function"||
     typeof idFactory!=="function"||!storage||
     typeof storage.getItem!=="function"||
     typeof storage.setItem!=="function")
    throw new Error("ข้อมูลส่งกลับแก้ไขไม่ถูกต้อง");
  validateSecureIncomingFiles(files);
  if(files.length<1||(isSinglePdf&&files.length!==1))
    throw new Error("ต้องแนบ PDF ฉบับแก้ไขใหม่ตามจำนวนที่กำหนด");
  const uploadIds=[];
  const keys=[];
  for(let i=0;i<files.length;i++){
    const file=files[i];
    const key="bhs-secure-revision:"+docId+":"+
      encodeURIComponent(JSON.stringify([
        i,file.name,file.size,file.lastModified||0
      ]));
    keys.push(key);
    let uploadId=storage.getItem(key);
    if(!UUID.test(uploadId||"")){
      uploadId=idFactory();
      if(!UUID.test(uploadId||""))
        throw new Error("สร้างรหัสส่งไฟล์ฉบับแก้ไขไม่ได้");
      storage.setItem(key,uploadId);
    }
    onProgress("ตรวจ PDF ฉบับแก้ไข "+(i+1)+"/"+files.length);
    const data=String(await encode(file)||"");
    const base64=data.split(",")[1];
    if(!base64)throw new Error("แปลง PDF ฉบับแก้ไขไม่ได้");
    const staged=await fetcher("/api/secure-revision",{
      method:"POST",credentials:"same-origin",cache:"no-store",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        action:"stage",docId,uploadId,fileName:file.name,base64
      })
    });
    if(!staged.ok)throw new Error(
      "ส่งไฟล์ฉบับแก้ไขที่ "+(i+1)+
      " ไม่สำเร็จ กรุณาตรวจสถานะไฟล์ที่ค้างก่อนส่งใหม่"
    );
    const body=await staged.json();
    if(body?.success!==true||body.docId!==docId||
       body.uploadId!==uploadId)
      throw new Error("ระบบไม่ยืนยันการรับไฟล์ฉบับแก้ไข");
    uploadIds.push(uploadId);
  }
  onProgress("กำลังบันทึกฉบับแก้ไขและส่งเข้าพิจารณา...");
  const response=await fetcher("/api/secure-revision",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      action:"finalize",docId,subject:subject.trim(),uploadIds
    })
  });
  if(!response.ok)throw new Error(
    "ยังส่งเรื่องกลับเข้าพิจารณาไม่สำเร็จ โปรดตรวจเอกสารก่อนลองอีกครั้ง"
  );
  const result=await response.json();
  if(result?.success!==true||result.docId!==docId||
     result.status!=="รอรองผู้อำนวยการ"||
     !(Number(result.activeFileVersion)>1))
    throw new Error("ระบบไม่ยืนยันฉบับแก้ไข");
  for(const key of keys){
    if(typeof storage.removeItem==="function")storage.removeItem(key);
  }
  return result;
}
