/** Only known stale, deleted or out-of-folder Drive references can be skipped.
 * Invalid credentials, network errors, and malformed server replies are fatal.
 */
export function isMissingDriveReference(error) {
  const message=String(error?.message||error||"");
  return [
    /ไม่ได้อยู่ในโฟลเดอร์/i, /ไม่พบไฟล์/i, /ไฟล์[^\n]*ถูกลบ/i,
    /no item with the given id/i, /file (?:was )?not found/i,
    /file (?:does not|doesn't) exist/i, /file is not in (?:the )?(?:expected )?folder/i,
    /file does not belong to/i,
  ].some(re=>re.test(message));
}
export const missingFilesOf=manifest=>Array.isArray(manifest?.missingFiles)?manifest.missingFiles:[];
export function isIncompleteArchive(manifest) {
  const integrity=manifest?.integrity||{};
  return missingFilesOf(manifest).length>0||integrity.status==="incomplete"||
    (typeof integrity.expectedFileCount==="number" &&
     typeof integrity.archivedFileCount==="number" &&
     integrity.archivedFileCount<integrity.expectedFileCount);
}
