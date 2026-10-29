/**
 * BHS E-Document reference Google Apps Script.
 * Keep the deployed script's existing FOLDER_ID and upload logic.
 * This repository sample reads the folder ID from Script Properties.
 * Add getFile logic to your EXISTING deployment rather than overwriting it blindly.
 */
const FOLDER_ID = PropertiesService.getScriptProperties().getProperty("BHS_DRIVE_FOLDER_ID");

/** Run manually ONCE, after signing into the owner account.
 * Save the printed value privately (never check into source control).
 * Setting it again invalidates the old Backup password.
 */
function setupBackupSecret() {
  const secret = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty("BHS_BACKUP_SECRET", secret);
  console.log("รหัสสำหรับช่องสำรองข้อมูล Drive (เก็บเป็นความลับ): " + secret);
}
function setup() {
  DriveApp.getFiles();
  console.log("ยืนยันสิทธิ์ Google Drive สำเร็จแล้ว");
}
function asJson(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!FOLDER_ID) throw new Error("ยังไม่ได้ตั้งค่า BHS_DRIVE_FOLDER_ID");
    if (data.action === "getFile") {
      // A public endpoint must NEVER grant arbitrary Drive read access.
      // Secret is entered by an admin on each backup, not bundled into frontend JS.
      const secret = PropertiesService.getScriptProperties().getProperty("BHS_BACKUP_SECRET");
      if (!secret || secret.length < 32 || !data.backupSecret || String(data.backupSecret) !== secret)
        throw new Error("รหัสสำรองข้อมูล Drive ไม่ถูกต้อง หรือยังไม่ได้ตั้งค่า BHS_BACKUP_SECRET");
      if (!data.fileId || typeof data.fileId !== "string")
        throw new Error("ไม่ได้ระบุรหัสไฟล์ที่จะสำรอง");
      const file = DriveApp.getFileById(data.fileId);
      const parents = file.getParents();
      let allowed = false;
      while (parents.hasNext()) {
        if (parents.next().getId() === FOLDER_ID) { allowed = true; break; }
      }
      if (!allowed) throw new Error("ไฟล์ไม่ได้อยู่ในโฟลเดอร์ Drive ของระบบ");
      const blob = file.getBlob();
      const bytes = blob && blob.getBytes();
      if (!bytes || !bytes.length) throw new Error("อ่านข้อมูลไฟล์ไม่ได้: " + file.getName());
      return asJson({
        success:true,fileName:file.getName(),mimeType:blob.getContentType(),
        base64:Utilities.base64Encode(bytes)
      });
    }
    // Existing upload API: no action property, same output fields as before.
    if (data.action) throw new Error("ไม่รองรับคำสั่งนี้");
    if (!data.base64 || !data.fileName) throw new Error("ข้อมูลไฟล์อัปโหลดไม่ครบ");
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const bytes = Utilities.base64Decode(data.base64);
    const blob = Utilities.newBlob(bytes,data.mimeType,data.fileName);
    const file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW); }
    catch (shareError) { /* Some work accounts block link sharing. */ }
    return asJson({
      success:true,fileId:file.getId(),fileUrl:file.getUrl(),
      fileName:file.getName(),fileSize:file.getSize()
    });
  } catch (error) {
    return asJson({success:false,error:String(error)});
  }
}
function doOptions(e) {
  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
}
