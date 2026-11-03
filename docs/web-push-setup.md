# BHS E-Document: เปิด Web Push และการจดจำอุปกรณ์ส่วนตัว

สถานะ: ฟีเจอร์นี้ต้องการการตั้งค่า Firebase/Vercel และทดสอบบนอุปกรณ์จริงก่อน Merge ขึ้นระบบที่ใช้งานอยู่

## 1. เตรียม Firebase Cloud Messaging (ไม่คิดค่าบริการส่ง FCM)
1. เปิด Firebase Console เลือกโครงการ bhs-edoc-2
2. Project settings > Cloud Messaging > Web configuration > Web Push certificates
3. เลือก Generate key pair (ถ้ายังไม่มี) แล้วคัดลอก **Public VAPID key** เท่านั้น
4. ตรวจว่า Firebase Cloud Messaging API เปิดใช้งานใน Google Cloud Console
5. ไม่จำเป็นต้องส่ง private VAPID key หรือ Firebase service account ให้ผู้พัฒนาผ่านแชต

## 2. ตั้งค่าใน Vercel
1. เปิด Vercel project ของ bhs-edocument
2. Settings > Environment Variables
3. เพิ่ม:
   - Name: VITE_BHS_FCM_VAPID_KEY
   - Value: public key จาก Firebase ข้อ 1
   - Environments: Production และ Preview ที่ต้องการทดสอบ
4. ตรวจว่าค่าฝั่ง server ที่เคยใช้สำหรับแอปยังมีอยู่:
   - BHS_FIREBASE_SERVICE_ACCOUNT_JSON
   - BHS_SIGNING_SESSION_SECRET (ความยาวอย่างน้อย 32 อักขระ)
5. Redeploy/Build หลังใส่ตัวแปร (VITE_ เป็น build-time public configuration)
6. อย่าใส่ private key, service account หรือ signing secret ลงใน source code

## 3. ตรวจ Firestore Rules ก่อนใช้จริง
- อุปกรณ์ Push จะถูกบันทึกใน top-level collections
  bhs_private_push_subscriptions และ bhs_private_push_events
- ควรให้เฉพาะ Firebase Admin SDK (ฝั่ง server) เข้าถึงสอง collection นี้
- ตรวจว่า Firestore Rules ไม่มี wildcard rule ที่อนุญาตให้อ่าน/เขียนข้อมูลทั้งหมด
  เพราะ rule ที่อนุญาตกว้าง ๆ จะทับข้อห้ามที่เฉพาะเจาะจงได้
- FCM token จะถูกเข้ารหัส AES-256-GCM ด้วย key ที่อนุพันธ์จาก secret ฝั่ง server
- ห้ามแก้ Rules ครอบทั้งระบบโดยไม่ตรวจสิทธิ์ของเมนูอื่นก่อน

## 4. เปิดรับแจ้งเตือนสำหรับครู
- Android: เปิดแอปจากหน้าจอหลัก หรือเปิดเว็บในเบราว์เซอร์ที่รองรับ
- iPhone/iPad: iOS/iPadOS 16.4+; เพิ่มเว็บไซต์ไปที่หน้าจอโฮมและเปิดผ่านไอคอนนั้น
- เข้าสู่ระบบ > กดกระดิ่ง > "เปิดการแจ้งเตือน" > ยอมรับสิทธิ์
- เพิ่มอุปกรณ์ได้หลายเครื่อง โดยแต่ละเครื่องต้องกดอนุญาตเอง
- กด "ปิดการแจ้งเตือนบนเครื่องนี้" เพื่อยกเลิกเฉพาะอุปกรณ์นั้น
- เมื่อออกจากระบบจะยกเลิกการลงทะเบียนแจ้งเตือนของเครื่องนั้น

## 5. การล็อกอินค้าง
- ในหน้า Login เลือก "เข้าสู่ระบบค้างไว้บนอุปกรณ์ส่วนตัว"
- เซสชันที่จำไว้จะอยู่ได้นานสูงสุด 30 วันหลังการต่ออายุล่าสุด
  และต่ออายุเมื่อเปิดใช้งานเว็บอีก (หากยังไม่หมดอายุ)
- หากไม่เลือก จะใช้ session cookie ของเบราว์เซอร์และหมดอายุภายใน 12 ชั่วโมง
- การเปลี่ยนรหัสผ่าน, ระงับบัญชี หรือกดออกจากระบบจะทำให้ใช้เซสชันเดิมไม่ได้
- การลงนาม PDF ของผู้อำนวยการยังใช้การยืนยันตัวตนแยก อายุ 30 นาที

## 6. ทดสอบก่อน Merge / Production
- login remembered: Android, iPad, desktop; ปิด/เปิดแอปและกลับเข้ามาใหม่
- shared-device mode: ไม่เลือกจำการล็อกอิน; ปิดเบราว์เซอร์แล้วเข้าสู่ระบบใหม่
- ผอ./รอง ผอ.: หนังสือถูกสร้าง/เสนอ/ส่งกลับ ส่งถูกผู้รับ
- ครู: หนังสือเผยแพร่และงานมอบหมาย ส่งเฉพาะผู้มีสิทธิ์
- เปิด/ปิด opt-in, กดออกจากระบบ, สลับบัญชีบนเครื่องเดียวกัน
- ตรวจเมื่อปิดแอปและเมื่อเปิดแอปใหม่; บางเครื่องจะแสดงจุดแทนจำนวนตัวเลข
- ในเบื้องหลัง ระบบใช้ badge 1 เพื่อบอกว่ามีงานรออย่างน้อยหนึ่งรายการ
  และเมื่อเปิดแอปจะซิงก์จำนวนจากรายการแจ้งเตือนจริง
- Push เป็น best-effort: การปิดแจ้งเตือน, ขาดอินเทอร์เน็ต, battery saver, OS/browser
  หรือเซิร์ฟเวอร์ส่งไม่สำเร็จ อาจทำให้ข้อความล่าช้าหรือไม่ปรากฏ
- หาก FCM/Vercel บริการไม่พร้อม ระบบจัดเก็บเอกสารหลักต้องทำงานได้เหมือนเดิม

Firebase Cloud Messaging เป็นบริการ no-cost; การใช้งาน Firestore/Vercel เกินโควตาฟรี
อาจมีค่าใช้จ่ายตามแผนของแต่ละบริการ
