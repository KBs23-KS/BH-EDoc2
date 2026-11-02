/**
 * Document preview policy. The signed, published PDF has precedence over the
 * author's proposal. Never silently label an unsigned proposal as signed.
 * Legacy documents without a signed file remain available through their own
 * original-file link, clearly distinguished from a signed copy.
 */
export const isPublishedDocument = d =>
  ["อนุมัติ/สั่งการแล้ว","เผยแพร่แล้ว"].includes(d?.status);

export const requiresDirectorSignedPdf = d =>
  ["คำสั่งโรงเรียน","หนังสือเวียนแจ้งรับทราบ"].includes(d?.type);

export const fileLink = f => {
  if(!f)return "";
  if(typeof f.url==="string"&&/^https:\/\//i.test(f.url))return f.url;
  if(typeof f.driveId==="string"&&f.driveId.trim())
    return "https://drive.google.com/file/d/"+encodeURIComponent(f.driveId.trim())+"/view";
  return "";
};

const firstAccessible = items => (Array.isArray(items)?items:[]).find(f=>fileLink(f))||null;

export function preferredDocumentFile(d){
  if(!d)return null;
  if(isPublishedDocument(d)){
    const signed=firstAccessible(d.signedFiles);
    if(signed)return {file:signed,signed:true};
    if(requiresDirectorSignedPdf(d))return null; // Do not disguise an unsigned draft as the signed version.
  }
  const original=firstAccessible(d.files);
  return original?{file:original,signed:false}:null;
}
export const signedPublicationMissing = d =>
  Boolean(isPublishedDocument(d)&&requiresDirectorSignedPdf(d)&&!firstAccessible(d?.signedFiles));
