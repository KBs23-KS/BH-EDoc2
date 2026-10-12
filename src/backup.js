import JSZip from "jszip";
import { getDocs, writeBatch, doc } from "firebase/firestore";

const COLLECTIONS = [
  "bhs_users","bhs_documents","bhs_settings","bhs_order_reservations",
  "bhs_outgoing_reservations","bhs_audit_logs","bhs_number_counters","bhs_reminders"
];
const toBytes=b64=>Uint8Array.from(atob(b64),x=>x.charCodeAt(0));
const toB64=bytes=>{
  // browser may exhaust argument stack for large blobs; encode in small chunks
  let out="";for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(out);
};
const gasCall=async(gasUrl,payload)=>{
  const r=await fetch(gasUrl,{method:"POST",body:JSON.stringify(payload)});
  const x=await r.json();if(!x.success)throw new Error(x.error||"Google Drive request failed");return x;
};

const findAttachments=(obj, found)=>{
  if(!obj||typeof obj!=="object")return;
  if(Array.isArray(obj)){obj.forEach(v=>findAttachments(v,found));return;}
  if(obj.driveId && obj.name)found.set(obj.driveId,{name:obj.name,mimeType:obj.mimeType||"application/pdf"});
  Object.values(obj).forEach(v=>findAttachments(v,found));
};

export async function createFullBackup({getCollectionRef,gasUrl,onStatus=()=>{}}){
  const zip=new JSZip();const contents={version:2,createdAt:new Date().toISOString(),collections:{},files:{}};
  const files=new Map();
  for(const name of COLLECTIONS){
    onStatus(`สำรองตาราง ${name}`);
    const snap=await getDocs(getCollectionRef(name));
    contents.collections[name]=snap.docs.map(d=>({id:d.id,data:d.data()}));
    if(name==="bhs_documents"||name.includes("reservations")) contents.collections[name].forEach(r=>findAttachments(r.data,files));
  }
  let i=0;
  for(const [id,meta] of files){
    i++;onStatus(`สำรองไฟล์ PDF/เอกสาร ${i}/${files.size}`);
    const result=await gasCall(gasUrl,{action:"getFile",fileId:id});
    const filePath=`files/${i}-${meta.name.replace(/[\\/]/g,"_")}`;
    zip.file(filePath,toBytes(result.base64));
    contents.files[id]={path:filePath,name:meta.name,mimeType:result.mimeType||meta.mimeType};
  }
  zip.file("manifest.json",JSON.stringify(contents,null,2));
  onStatus("กำลังสร้าง ZIP...");
  return zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:5}});
}

// This is an overwrite-by-ID recovery. It is intentionally not a one-click operation.
// Firestore cannot atomically restore a multi-collection archive plus Google Drive files.
export async function restoreFullBackup({db,getCollectionRef,zipFile,gasUrl,onStatus=()=>{}, mode="merge",selected=[]}){
  const zip=await JSZip.loadAsync(zipFile);
  const metaFile=zip.file("manifest.json");
  if(!metaFile)throw new Error("ไม่มี manifest.json ในไฟล์สำรอง");
  const manifest=JSON.parse(await metaFile.async("string"));
  if(manifest.version!==2 || !manifest.collections || !manifest.files)throw new Error("รูปแบบไฟล์สำรองไม่รองรับ");
  // Upload attachments FIRST, then map their new Drive ID/URL into the Firestore records.
  if(!["merge","selected","replace"].includes(mode))throw new Error("รูปแบบการกู้คืนไม่ถูกต้อง");
  if(mode==="selected" && !selected.length)throw new Error("กรุณาระบุรายการที่จะกู้คืน");
  if(mode==="replace" && COLLECTIONS.some(name=>!Array.isArray(manifest.collections[name])))
    throw new Error("ชุดสำรองนี้ไม่มีทะเบียนครบทุกส่วน จึงห้ามใช้โหมดย้อนระบบทั้งชุด");
  // Upload only files referenced by selected entries; each original Drive id is remapped once.
  const selectedEntries=new Set(selected);
  const rows=(name)=> (manifest.collections[name]||[]).filter(r=>mode!=="selected"||selectedEntries.has(`${name}:${r.id}`));
  const attachmentIds=new Set();
  if(mode==="selected") {
    const collect=o=>{if(!o||typeof o!=="object")return;if(Array.isArray(o)){o.forEach(collect);return;}if(o.driveId)attachmentIds.add(o.driveId);Object.values(o).forEach(collect);};
    for(const name of COLLECTIONS)rows(name).forEach(r=>collect(r.data));
  }
  const remap={};
  let index=0;
  const entries=Object.entries(manifest.files).filter(([id])=>mode!=="selected"||attachmentIds.has(id));
  for(const [oldId,meta] of entries){
    index++;onStatus(`กู้คืนไฟล์ ${index}/${entries.length}`);
    const zipEntry=zip.file(meta.path);if(!zipEntry)throw new Error(`ไฟล์ไม่ครบ: ${meta.path}`);
    const bytes=await zipEntry.async("uint8array");
    const result=await gasCall(gasUrl,{fileName:meta.name,mimeType:meta.mimeType,base64:toB64(bytes)});
    remap[oldId]={driveId:result.fileId,url:result.fileUrl,name:result.fileName||meta.name};
  }
  const patchObject=obj=>{
    if(Array.isArray(obj))return obj.map(patchObject);
    if(!obj || typeof obj!=="object")return obj;
    const copy={...obj};
    if(copy.driveId && remap[copy.driveId])Object.assign(copy,remap[copy.driveId]);
    for(const k of Object.keys(copy))copy[k]=patchObject(copy[k]);
    return copy;
  };
  let batch=writeBatch(db),writes=0;
  const commit=async()=>{if(writes){await batch.commit();batch=writeBatch(db);writes=0;}};
  for(const name of COLLECTIONS){
    const records=rows(name);
    let i=0;
    for(const r of records){
      i++;onStatus(`กู้คืน ${name} ${i}/${records.length}`);
      if(!r.id || !r.data)throw new Error("รายการในไฟล์สำรองไม่สมบูรณ์");
      batch.set(doc(getCollectionRef(name),r.id),patchObject(r.data));writes++;
      if(writes>=350)await commit();
    }
  }
  await commit();
  if(mode==="replace") {
    // This is not cross-service atomic. A current-state ZIP must be generated first.
    // Stop concurrent writers by placing this app in maintenance mode before using this operation.
    for(const name of COLLECTIONS){
      const desired=new Set((manifest.collections[name]||[]).map(r=>r.id));
      const current=await getDocs(getCollectionRef(name));
      for(const record of current.docs){
        if(!desired.has(record.id)){
          batch.delete(doc(getCollectionRef(name),record.id));writes++;
          if(writes>=350)await commit();
        }
      }
    }
    await commit();
  }
  // Google Drive originals are intentionally NOT deleted in replace mode: deleting a signed
  // PDF can be irreversible. Orphaned Drive files require a separate admin reconciliation.
}

/** Read-only comparison; it never changes Firestore or Drive. */
export async function inspectFullBackup({zipFile,getCollectionRef,onStatus=()=>{}}) {
  const zip=await JSZip.loadAsync(zipFile);
  const entry=zip.file('manifest.json');
  if(!entry)throw new Error('ไม่มี manifest.json');
  const manifest=JSON.parse(await entry.async('string'));
  if(manifest.version!==2||!manifest.collections||!manifest.files)throw new Error('ไม่รองรับรูปแบบ Backup');
  const details=[];
  const canonical=x=>JSON.stringify(x,(key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
  for(const name of COLLECTIONS){
    onStatus(`ตรวจสอบ ${name}`);
    const saved=manifest.collections[name]||[];
    const current=await getDocs(getCollectionRef(name));
    const savedIds=new Set(saved.map(x=>x.id));const currentIds=new Set(current.docs.map(x=>x.id));
    const currentMap=new Map(current.docs.map(x=>[x.id,x.data()]));
    details.push({name,saved:saved.length,current:current.size,
      changed:saved.filter(x=>currentMap.has(x.id)&&canonical(x.data)!==canonical(currentMap.get(x.id))).length,
      onlyInBackup:[...savedIds].filter(x=>!currentIds.has(x)).length,
      onlyInCurrent:[...currentIds].filter(x=>!savedIds.has(x)).length});
  }
  for(const f of Object.values(manifest.files))if(!zip.file(f.path))throw new Error(`ไฟล์แนบใน ZIP ไม่ครบ: ${f.path}`);
  return {createdAt:manifest.createdAt,details,fileCount:Object.keys(manifest.files).length};
}
