# เมนู Sidebar ไม่กระโดดกลับไปด้านบนเวลาเปลี่ยนหน้า

เดิม `SidebarContent` เป็น component ที่ประกาศภายใน `MainLayout` ทำให้เมื่อกดเมนู (state `activeMenu` เปลี่ยน) React สร้าง component type ใหม่และ unmount/remount เมนู ScrollTop จึงกลับเป็น 0

แก้ให้ใช้ `renderSidebarContent()` เป็น render helper ปกติ ทั้ง desktop/mobile ทำให้ React เก็บ DOM ของแถบเมนูเดิมขณะเปลี่ยนหน้าและรักษาตำแหน่งเลื่อน เมนูยังอัปเดต active highlighting ตามเดิม

ไม่มีการเปลี่ยนสี ธีม รายการเมนู สิทธิ์ผู้ใช้ mobile drawer หน้าเนื้อหา หรือข้อมูล Firebase/Google Drive/Backup.

ควรทดสอบด้วยมือ: เลื่อน sidebar ไปกลาง/ล่าง คลิกเมนู 3-4 รายการ, ตรวจว่ายังอยู่ระดับเดิม, ทดสอบมือถือเปิด/ปิด drawer ปกติ
