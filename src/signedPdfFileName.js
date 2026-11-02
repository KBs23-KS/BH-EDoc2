/** Preserve an uploaded PDF's original name, marking the signed COPY only.
 * Does not rename, replace, or modify its source Drive file.
 */
export function signedPdfFileName(originalName, fallbackBase="เอกสาร"){
  const raw=typeof originalName==="string"?originalName.trim():"";
  const fallback=String(fallbackBase||"เอกสาร").trim().replace(/[\\/:*?"<>|\u0000-\u001F]/g,"_")||"เอกสาร";
  const name=(/\.pdf$/i.test(raw)?raw:`${fallback}.pdf`)
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g,"_");
  const ext=name.match(/\.pdf$/i)?.[0]||".pdf";
  const base=(name.slice(0,-ext.length).trim()
    .replace(/(?:\s*\(ลงนามแล้ว\))+$/u,"").trim())||fallback;
  return `${base} (ลงนามแล้ว)${ext}`;
}
