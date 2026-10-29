/** Local-only PDF source for signing when protected Drive getFile is unavailable.
 * Never sends the source PDF to a public reader endpoint; only already-signed
 * PDF goes through the pre-existing upload workflow after approval.
 */
export async function readLocalSignaturePdf(file){
  if(!file||!String(file.name||"").toLowerCase().endsWith(".pdf"))
    throw new Error("กรุณาเลือกไฟล์ PDF เท่านั้น");
  if(!file.size)throw new Error("ไฟล์ PDF ว่างเปล่า");
  if(file.size>100*1024*1024)throw new Error("PDF ใหญ่เกิน 100 MB ไม่สามารถลงนามในหน้านี้ได้");
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.length!==file.size)throw new Error("อ่านข้อมูล PDF ได้ไม่ครบ");
  // PDF files may have a short binary preamble, but the PDF header must be
  // at the beginning of the file by convention (first 1024 bytes).
  const prefix=Array.from(bytes.slice(0,Math.min(bytes.length,1024)),x=>String.fromCharCode(x)).join("");
  if(!prefix.includes("%PDF-"))throw new Error("ข้อมูลไฟล์ไม่ใช่ PDF ที่ถูกต้อง");
  return bytes;
}
const canonicalName=name=>String(name||"").trim().normalize("NFC").replace(/ \(\d+\)(?=\.pdf$)/i,"").toLowerCase();
export const signaturePdfNamesMatch=(selected,expected)=>canonicalName(selected)===canonicalName(expected);
