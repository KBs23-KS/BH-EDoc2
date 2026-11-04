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
    // PREPARATION ONLY — the live school GAS deployment is not changed.
    // In a future approved cutover, the authenticated BHS SERVER (never the
    // browser) supplies BHS_UPLOAD_SECRET for secureUpload.
    if (data.action === "secureUpload") {
      const uploadSecret = PropertiesService.getScriptProperties()
        .getProperty("BHS_UPLOAD_SECRET");
      if (!uploadSecret || uploadSecret.length < 32 ||
          !data.uploadSecret || String(data.uploadSecret) !== uploadSecret)
        throw new Error("ไม่อนุญาตให้อัปโหลดโดยไม่มีรหัสเซิร์ฟเวอร์");
      if (!data.fileName || typeof data.fileName !== "string" ||
          data.fileName.length > 180 ||
          /[\\/<>:"|?*\\x00-\\x1f]/.test(data.fileName) ||
          !data.fileName.trim() || data.fileName === "." || data.fileName === "..")
        throw new Error("ชื่อไฟล์ไม่ถูกต้อง");
      if (typeof data.base64 !== "string" || !data.base64 ||
          data.base64.length > 14 * 1024 * 1024 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(data.base64))
        throw new Error("เนื้อหาไฟล์ไม่ถูกต้องหรือใหญ่เกินกำหนด");
      const bytes = Utilities.base64Decode(data.base64);
      if (!bytes.length || bytes.length > 10 * 1024 * 1024)
        throw new Error("ไฟล์ใหญ่เกิน 10 MB");
      const mime = String(data.mimeType || "").toLowerCase();
      const b = i => ((bytes[i] || 0) + 256) % 256;
      const isPdf = bytes.length >= 8 && b(0) === 37 && b(1) === 80 &&
        b(2) === 68 && b(3) === 70 && b(4) === 45;
      const isPng = bytes.length >= 8 && [137,80,78,71,13,10,26,10]
        .every((value,i) => b(i) === value);
      const isJpeg = bytes.length >= 4 && b(0) === 255 && b(1) === 216 &&
        b(2) === 255;
      if (!((mime === "application/pdf" && /\\.pdf$/i.test(data.fileName) && isPdf) ||
        (mime === "image/png" && /\\.png$/i.test(data.fileName) && isPng) ||
        (mime === "image/jpeg" && /\\.jpe?g$/i.test(data.fileName) && isJpeg)))
        throw new Error("ชนิดไฟล์และข้อมูลภายในไม่ตรงกัน");
      const folder = DriveApp.getFolderById(FOLDER_ID);
      const file = folder.createFile(Utilities.newBlob(bytes,mime,data.fileName));
      // Never share official PDFs publicly as a side effect of upload.
      return asJson({
        success:true,fileId:file.getId(),fileUrl:file.getUrl(),
        fileName:file.getName(),fileSize:file.getSize()
      });
    }
    // Compatibility only. The old unauthenticated upload path must be
    // explicitly enabled during a separately approved phased deployment.
    // Without the property it is DISABLED by default in this reference GAS.
    if (data.action) throw new Error("ไม่รองรับคำสั่งนี้");
    if (PropertiesService.getScriptProperties()
      .getProperty("BHS_ALLOW_LEGACY_UPLOAD") !== "true")
      throw new Error("ปิด API อัปโหลดแบบเดิมที่ไม่มีการยืนยันตัวตน");
    if (!data.base64 || !data.fileName) throw new Error("ข้อมูลไฟล์อัปโหลดไม่ครบ");
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const bytes = Utilities.base64Decode(data.base64);
    const blob = Utilities.newBlob(bytes,data.mimeType,data.fileName);
    const file = folder.createFile(blob);
    // Legacy compatibility retains old link-sharing behavior ONLY if
    // explicitly opted into. It is not a secure upload mode.
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
