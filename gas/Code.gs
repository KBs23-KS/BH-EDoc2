/**
 * Supplemental Google Apps Script API for BHS E-Document.
 * CAUTION: Deploy by editing the existing Apps Script, not by silently replacing it.
 * Set script property BHS_DRIVE_FOLDER_ID to the same Drive folder as the existing uploads.
 * Keep the original deployment URL and permissions/configuration consistent.
 */
function doPost(e) {
  try {
    var input = JSON.parse(e.postData.contents || '{}');
    var result;
    if (input.action === 'getFile') {
      if (!input.fileId || typeof input.fileId !== 'string') {
        throw new Error('getFile ต้องมี fileId');
      }
      var file = DriveApp.getFileById(input.fileId);
      var blob = file.getBlob();
      var bytes = blob && blob.getBytes();
      if (!bytes || bytes.length === 0) {
        throw new Error('ไม่สามารถอ่านข้อมูลไฟล์จาก Google Drive ได้: ' + file.getName());
      }
      result = {success:true,fileName:file.getName(),mimeType:blob.getContentType(),
        base64:Utilities.base64Encode(bytes)};
    } else {
      // Compatible with the existing React upload payload without an 'action' property.
      var folderId = PropertiesService.getScriptProperties().getProperty('BHS_DRIVE_FOLDER_ID');
      if (!folderId) throw new Error('ตั้งค่า BHS_DRIVE_FOLDER_ID ใน Script Properties ก่อน');
      if (!input.base64 || !input.fileName) throw new Error('ข้อมูลไฟล์ไม่ครบ');
      var content = Utilities.base64Decode(input.base64);
      var blob = Utilities.newBlob(content,input.mimeType||'application/octet-stream',input.fileName);
      var file = DriveApp.getFolderById(folderId).createFile(blob);
      result = {success:true,fileId:file.getId(),fileUrl:file.getUrl(),fileName:file.getName(),fileSize:file.getSize()};
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({success:false,error:String(err)})).setMimeType(ContentService.MimeType.JSON);
  }
}
