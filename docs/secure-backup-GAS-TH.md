# BHS E-Document — แก้ Backup Google Drive แบบไม่เปิดอ่านไฟล์สาธารณะ

## สาเหตุที่ยืนยันจากโค้ด Apps Script ที่ใช้งานจริง

โค้ดเดิมมี `Utilities.base64Decode(data.base64)` โดยไม่แยกคำสั่ง. เวลากด
Backup เว็บส่ง `{"action":"getFile","fileId":"..."}` ซึ่งไม่มี `base64`
จึงเกิด `Exception: Argument cannot be null: data`.

## วิธีทำแบบไม่เปลี่ยนระบบอัปโหลดเดิม

1. เปิด **Apps Script ตัวเดิม** ซึ่งมี `FOLDER_ID` และ `doPost` ตรงกับที่ตรวจพบ
2. สำรองข้อความใน `Code.gs` เดิมไว้ก่อน ไม่เปลี่ยน URL /exec.
3. ใน Project Settings > Script Properties เพิ่มชื่อ `BHS_BACKUP_SECRET` พร้อม
   ค่าสุ่มที่ยาวอย่างน้อย 32 ตัวอักษร (สร้างจาก password manager ได้)
   **ห้ามส่งค่ารหัสนี้ทางแชตหรือ commit ลง GitHub**.
4. เพิ่มเงื่อนไขสำหรับ `data.action === "getFile"` **ก่อน**
   `Utilities.base64Decode(data.base64)`. ตรวจรหัสลับกับ
   `PropertiesService.getScriptProperties().getProperty("BHS_BACKUP_SECRET")`.
   ตรวจด้วยว่าไฟล์มี parent เป็น `FOLDER_ID`.
   ตัวอย่างโค้ดครบอยู่ใน `gas/Code.gs` แต่ไฟล์ใน repository
   ใช้ Script Property ชื่อ `BHS_DRIVE_FOLDER_ID` แทนค่าคงที่:
   **ห้ามคัดลอกทับ Code.gs เดิมโดยไม่ปรับ FOLDER_ID และตรวจส่วนอัปโหลดเดิม**
5. Apps Script > Deploy > Manage deployments > Edit ของ deployment เดิม >
   New version > Deploy. ให้ URL /exec ยังเป็น URL เดิม.
6. เมื่อแพตช์ React ใน PR นี้ขึ้นเว็บไซต์แล้ว จะมีช่อง “รหัสสำรองข้อมูล Drive”
   ในหน้าแอดมิน ให้พิมพ์รหัสทุกครั้งที่สำรอง; รหัสอยู่ในหน่วยความจำหน้าปัจจุบัน
   ชั่วคราว ไม่เก็บใน LocalStorage หรือ Firestore.
7. ดาวน์โหลด ZIP แล้วตรวจ `manifest.json` และ `files/` ครบ ก่อนพิจารณา Merge PR #5.

### ข้อควรระวัง

- ไม่ใช้รหัสในซอร์ส React เพราะทุกคนสามารถอ่าน JavaScript ที่เว็บไซต์ได้
- ไม่ใช่การปรับ Firestore Rules และไม่แก้ข้อมูลเก่าหรือ PDF เดิม
- หากไฟล์เคยถูกย้ายออกจาก `FOLDER_ID` โปรแกรมจะหยุดโดยแจ้งชื่อไฟล์;
  ไม่ควรข้ามไฟล์นั้นเงียบ ๆ เพราะจะทำให้สำรองไม่ครบ
- Apps Script และเบราว์เซอร์มีข้อจำกัดขนาดไฟล์/เวลา ถ้าบางไฟล์ใหญ่มาก
  ต้องทดสอบ Backup จริง ไม่ถือว่า GitHub Actions ที่ผ่านคือการสำรองสำเร็จ
- การเปิดให้ทุกคนเรียก API upload แบบเดิมยังมีความเสี่ยงแยกต่างหาก
