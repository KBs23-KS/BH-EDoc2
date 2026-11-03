import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { verifyTestProject } from "./firebaseConfig.js";

const projectLabel = document.getElementById("project");
const setup = document.getElementById("setup");
const probe = document.getElementById("probe");
const result = document.getElementById("result");

try {
  // Verify BEFORE calling initializeApp or Firestore. No production fallback.
  const config = verifyTestProject();
  const app = initializeApp(config, "bhs-edoc-security-test");
  if (app.options.projectId !== "bhs-edoc-security-test") {
    throw new Error("Connected project is not the isolated test project.");
  }
  const db = getFirestore(app);
  projectLabel.textContent = app.options.projectId;
  setup.textContent = "Firebase ทดลองเชื่อมต่อในฝั่งเว็บไซต์แล้ว ยังไม่มีการอ่านหรือเขียน Firestore";
  probe.disabled = false;
  probe.addEventListener("click", async () => {
    probe.disabled = true;
    result.textContent = "กำลังอ่านเอกสารจำลองเพื่อตรวจสอบกฎ...";
    try {
      const testRef = doc(db,"artifacts","bhs-edoc-app","public","data","bhs_documents","__security_test_probe__");
      await getDoc(testRef);
      result.textContent = "⚠️ ไม่ผ่าน: กฎอนุญาตการอ่านโดยไม่ยืนยันตัวตน ห้ามดำเนินการทดสอบข้อมูลจริง";
    } catch (err) {
      if (err.code === "permission-denied") {
        result.textContent = "✅ ผ่าน: Firestore ปฏิเสธการอ่านโดยไม่ได้รับสิทธิ์ตามที่คาดไว้";
      } else {
        result.textContent = "ยังสรุปผลไม่ได้: " + (err.code || "connection-error") + " — ตรวจการเชื่อมต่อและ Firestore Rules";
      }
    } finally {
      probe.disabled = false;
    }
  });
} catch (error) {
  projectLabel.textContent = "BLOCKED";
  setup.textContent = "หยุดการเริ่มต้นเพื่อความปลอดภัย: " + error.message;
}
