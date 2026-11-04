# BHS E-Document — ระบบแจ้งเตือนฟรีบนมือถือ / iPad / คอมพิวเตอร์

วันที่ 4 พฤศจิกายน 2569 — Draft PR #46 แยกจากงานความปลอดภัย PR #45

## สิ่งที่เพิ่มในโค้ด

- ใช้ Web Push มาตรฐาน VAPID ผ่านเบราว์เซอร์ ไม่ใช้ Firebase Cloud Functions
- ปุ่มเปิด/ปิดการแจ้งเตือนบนอุปกรณ์นี้ในหน้ากระดิ่งเดิม ผู้ใช้กดอนุญาตเอง
- Android Chrome, Chrome บนคอม และ iPadOS 16.4+ ที่ติดตั้งเว็บไซต์ลงหน้าจอหลักเป็นเว็บแอป
- จำนวนงานค้างในแอป/ไอคอน (เมื่อระบบรองรับ Badging API) พร้อมตัวเลขในแท็บ Chrome
- เซิร์ฟเวอร์ตรวจสอบ Username/Password Session เดิม (HttpOnly 7 วัน), สิทธิ์ผู้ใช้และรายชื่อผู้รับจากเอกสารจริงก่อนส่ง Push
- ข้อความแจ้งเตือนบนหน้าจอล็อกเป็นข้อความทั่วไป ไม่ส่งชื่อเรื่อง/ข้อมูลเอกสารราชการ
- เก็บ Push Subscription โดยเข้ารหัส AES-256-GCM ใน Firestore collection แยกจาก public data
- ไม่แก้หน้า Login, ไม่เปลี่ยนรหัสผ่าน, ไม่ใช้โค้ด PR #45 และไม่เปลี่ยน Firestore Rules จริง

## ค่าใช้จ่าย

มาตรฐาน Web Push ไม่คิดค่าส่งข้อความรายครั้งจากเบราว์เซอร์ แต่ยังอยู่ภายใต้โควตาและเงื่อนไขแพ็กเกจ Vercel / Firebase ที่โรงเรียนใช้อยู่ หากอยู่ในโควตาเดิมไม่มีค่าใช้จ่ายเพิ่ม
เว็บไซต์เดิมต้องมี HTTPS ซึ่งระบบ Vercel เดิมมีอยู่แล้ว

หมายเหตุ: ข้อความ Push เป็น best-effort ไม่รับประกันทุกเครื่องทุกเวลา (โหมด Focus, ประหยัดแบตเตอรี่, เน็ตขัดข้อง หรือผู้ใช้ไม่อนุญาตอาจป้องกันการแสดงแจ้งเตือน)

## ตั้งค่า Vercel Environment Variables ก่อนใช้งานจริง (หลังอนุมัติ)

VITE_BHS_ENABLE_PUSH=true
BHS_WEB_PUSH_ENABLED=true
BHS_WEB_PUSH_PUBLIC_KEY=<public VAPID key>
BHS_WEB_PUSH_PRIVATE_KEY=<private VAPID key>
BHS_WEB_PUSH_CONTACT=https://bhs-edocument.vercel.app
BHS_WEB_PUSH_STORE_KEY=<random 32 bytes, encoded base64url>
BHS_FIREBASE_SERVICE_ACCOUNT_JSON=<existing Firebase Admin credential of bhs-edoc-2>
BHS_SIGNING_SESSION_SECRET=<existing signing/app session HMAC key>

ตัวแปรที่ลงท้าย PRIVATE หรือ STORE ต้องตั้งใน Vercel เท่านั้น ห้ามใส่ใน GitHub หรือ VITE_
สร้าง VAPID keys แบบไม่เสียเงินได้ด้วย: npx web-push generate-vapid-keys
สร้าง BHS_WEB_PUSH_STORE_KEY ด้วย:
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

ต้องตรวจสอบด้วยว่า app-session cookie ของระบบเดิมทำงานได้จริง มิฉะนั้นจะไม่เปิด Push แต่ระบบล็อกอินเก่ายังใช้งานต่อได้

## Firestore Rules — ต้องตรวจสอบก่อนเปิด Push

Subscription เก็บที่ top-level collection ชื่อ:
- bhs_private_webpush
- bhs_private_webpush_dispatches

ต้องตรวจว่า Firestore Rules ของโปรเจกต์ bhs-edoc-2 ปฏิเสธการอ่าน/เขียนสอง collection นี้จาก Browser/Anonymous Auth ก่อนเปิดใช้งาน

Rules FRAGMENT ที่ควรผนวกเข้ากับ Rules เดิม (ไม่ใช่ไฟล์ Rules ทั้งระบบ):

match /bhs_private_webpush/{deviceId} {
  allow read, write: if false;
}
match /bhs_private_webpush_dispatches/{eventId} {
  allow read, write: if false;
}

ห้ามนำข้อความข้างบนไปแทน Firestore Rules ปัจจุบันทั้งหมด และห้ามเปลี่ยน Rules ก่อนตรวจผลกระทบของระบบเดิม

## ขอบเขตการส่งแจ้งเตือนรุ่นแรก

เมื่อผู้ดำเนินการบันทึกเอกสาร เบราว์เซอร์ที่ล็อกอินอยู่ขอให้เซิร์ฟเวอร์ตรวจเหตุการณ์แล้วส่ง Push โดยคำนวณสิทธิ์/ผู้รับจาก Firestore ใหม่ทั้งหมด มี idempotency key ป้องกันส่งซ้ำ

เหตุการณ์ที่รองรับ:
1. สร้างเรื่องใหม่ → รอง ผอ./แอดมิน
2. รองเสนอเรื่อง → ผอ./แอดมิน
3. ส่งกลับแก้ไข → เจ้าของเรื่อง
4. อนุมัติ/เผยแพร่ → ผู้รับหนังสือ/หัวหน้ากลุ่ม
5. เกษียณต่อ/มอบหมาย → ครูผู้ได้รับงานหรือกลุ่มเป้าหมาย

ข้อจำกัด: หากผู้ดำเนินการปิดแอปทันทีจนไม่ส่งคำขอแจ้งเตือน หรือไม่มีเบราว์เซอร์ที่ส่งเหตุการณ์ได้ อาจไม่เกิด Push ของเหตุการณ์นั้น การใช้ Backend Event Queue ที่รับประกันมากขึ้นเป็นงานขั้นถัดไป (ไม่เกี่ยวกับการรื้อ Login)
Vercel Hobby Cron ตรวจทุกนาทีไม่ได้ และไม่ได้ใช้ Cloud Functions แบบ Blaze

การปิดหน้าจอของผู้รับไม่ใช่ปัญหา หากลงทะเบียน Push ไว้แล้ว เว็บแอปสามารถแสดงการแจ้งเตือนเมื่อปิดหน้าเว็บตามการรองรับของอุปกรณ์ได้

## ก่อน Merge / Deploy ต้องตรวจ

[ ] GitHub Actions PR #46 ผ่าน Unit Test + Vite Build
[ ] ตรวจ Firestore Rules ทั้งสอง private collection
[ ] สร้าง/เก็บ VAPID keys และ encryption key เป็นความลับใน Vercel
[ ] ทดสอบแจ้งเตือนจริงบน Android Chrome / Chrome Desktop / iPad PWA
[ ] ทดสอบคนไม่มีสิทธิ์ไม่ได้รับแจ้งเตือนเอกสารคนอื่น
[ ] ทดสอบ logout, 7-day-cookie หมดอายุ, อุปกรณ์แชร์กัน, ผู้ใช้ถูกระงับ
[ ] ผู้ดูแลอนุมัติ Merge/Deploy แยกจากการอนุมัติสร้าง Draft PR

สถานะปัจจุบัน: โค้ด Draft เท่านั้น ยังไม่แก้ bhs-edoc-2 หรือ Vercel Production
