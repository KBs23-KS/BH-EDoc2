# แก้ปัญหา Backup: “Argument cannot be null: data”

## สาเหตุที่เป็นไปได้มากที่สุด
เว็บไซต์ส่ง POST ไปยัง GAS โดยมี `{"action":"getFile","fileId":"..."}`
เพื่ออ่านไฟล์แนบจาก Google Drive. Google Apps Script รุ่นเดิมที่รับแค่อัปโหลด
อาจพยายามรัน `Utilities.base64Decode(input.base64)` เมื่อ payload นี้ไม่มี
`base64` จึงขึ้น `Argument cannot be null: data`.

**GitHub ไม่สามารถอัปเดต Google Apps Script deployment ที่ใช้งานอยู่ได้เอง**
การแก้ `gas/Code.gs` ใน repository เพียงอย่างเดียวจะไม่มีผลต่อ URL /exec ที่เว็บใช้อยู่

## วิธีแก้ใน Google Apps Script ที่ใช้งานจริง

1. เปิดโปรเจกต์ Apps Script **เดิม** ที่ใช้สำหรับอัปโหลดไฟล์ของ BHS E-Document
   ตรวจสอบจาก URL /exec ในโค้ดเว็บไซต์กับรายการ Deployments ของ Apps Script
2. สำรองโค้ด Apps Script เดิมไว้ก่อน ห้ามลบหรือแทนที่ฟังก์ชันอัปโหลดเดิมทั้งหมด
3. ภายใน `doPost(e)` หลัง `JSON.parse(e.postData.contents)` และก่อนบรรทัด
   ที่เรียก `Utilities.base64Decode(...)` เพิ่มกรณี `action === 'getFile'`
   ตามตัวอย่างด้านล่าง โดยปรับชื่อตัวแปร `payload` ให้ตรงกับโค้ดเดิม:

```javascript
if (payload.action === 'getFile') {
  if (!payload.fileId) throw new Error('getFile requires fileId');
  const file = DriveApp.getFileById(payload.fileId);
  const blob = file.getBlob();
  const bytes = blob && blob.getBytes();
  if (!bytes || bytes.length === 0) throw new Error('Cannot read Drive file: ' + file.getName());
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    fileName: file.getName(),
    mimeType: blob.getContentType(),
    base64: Utilities.base64Encode(bytes)
  })).setMimeType(ContentService.MimeType.JSON);
}
```

4. บันทึกโค้ด แล้ว Deploy > Manage deployments > เลือก deployment เดิม >
   Edit > Version: New version > Deploy เพื่อให้ URL /exec เดิมทำงานกับโค้ดใหม่
5. ทดสอบอัปโหลด PDF ขนาดเล็กกับข้อมูลทดลองก่อน แล้วค่อยทดลอง Backup
   โดยต้องตรวจว่า ZIP มี `manifest.json` และไฟล์ภายใน `files/` ครบ

**ข้อควรระวัง**: อย่าเปลี่ยน URL /exec ของเว็บไซต์โดยไม่จำเป็น อย่านำสคริปต์
ใน repo ไปเขียนทับสคริปต์อัปโหลดที่ใช้งานจริงทั้งไฟล์ และอย่าเปิดให้บุคคลอื่น
อ่านไฟล์ Drive ได้โดยไม่ผ่านระบบยืนยันสิทธิ์ การเพิ่ม `getFile` ให้ API ที่ไม่มี
การควบคุมผู้เรียกอาจเปิดช่องให้อ่านเอกสารได้ — ต้องทบทวนสิทธิ์ GAS ก่อนใช้งานจริง

## ตรวจข้อผิดพลาดอื่น
หาก deployment รองรับ `getFile` อยู่แล้ว แต่ยังล้มเหลว ให้ดูชื่อไฟล์ที่
ข้อความผิดพลาดใหม่ระบุ และตรวจว่าบัญชีผู้ deploy GAS สามารถเปิดไฟล์นั้นได้จริง
โดยเฉพาะไฟล์ที่ถูกย้าย ลบ หรือเปลี่ยนสิทธิ์

จนกว่าจะสำรอง Firestore และ Drive ครบและตรวจไฟล์ ZIP ได้ **ห้าม Merge PR #5**
เพราะการ Merge โค้ดไม่ใช่การสำรองข้อมูลและ rollback Git ไม่คืนข้อมูล Firebase
