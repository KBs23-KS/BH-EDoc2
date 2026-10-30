import React, { useEffect, useState, useRef } from "react";
import {
  LayoutDashboard,
  Inbox,
  Send,
  FileText,
  FileSignature,
  Search,
  Users,
  Menu,
  X,
  Bell,
  LogOut,
  Plus,
  File as FileIcon,
  Trash2,
  User as UserIcon,
  Lock,
  UserPlus,
  Check,
  CheckCircle,
  Download,
  FileUp,
  Loader2,
  AlertCircle,
  Edit,
  Save,
  RefreshCw,
  History,
  Filter,
  Database,
  KeyRound,
  RotateCcw,
  Volume2,
  VolumeX,
  Settings,
  Hash,
  ClipboardList
} from "lucide-react";

import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  deleteDoc,
  arrayUnion, runTransaction, getDocs, getDoc, getDocFromServer, getDocsFromServer, writeBatch, query, orderBy, limit, startAfter,
} from "firebase/firestore";
import { PdfSignatureEditor } from "./PdfSignatureEditor";
import {canArchiveTrialOrder,canRestoreTrialOrder} from "./orderTrialArchive";
import {parseRegisterNumber,occupiedRegisterNumbers,nextAvailableNumber,checkLinkedOrder,registerCounterStamp} from "./orderNumberPolicy";
import { createFullBackup, restoreFullBackup, inspectFullBackup } from "./backup";
import {loadSavedBackupSecret,saveBackupSecret,forgetBackupSecret} from "./backupSecretPrefs";
import { SearchCenter, PendingReport, AckReport, ExportRegisters, StatsDashboard } from "./Extensions";
import { eventTime, recipientSnapshot, recipientsOf, isRecipient, URGENCY, sortUrgency, canReadDoc } from "./workflow";
import {headGroups,pendingHeadGroups,pendingAssignmentEvents,routingAlerts,routingHistory,canViewRouted,isFinalDoc,audienceSnapshot,routeMessage} from "./routing";
import {makeRoutingActions} from "./routingActions";
import {RoutingWorkspace,DocumentDetail,RoutingPicker} from "./RoutingWorkspace";
import {shouldShowRoleMenu} from "./menuVisibility.js";
import OrgHeads from "./OrgHeads";
import DashboardHomePanels,{RoleIndicators} from "./DashboardHomePanels";
import {countDocumentTypes} from "./dashboardDocumentCounts.js";
import {playNotification} from "./notificationSound";

const firebaseConfig = typeof __firebase_config !== 'undefined'
  ? JSON.parse(__firebase_config)
  : {
      apiKey: "AIzaSyDK3KOtUeQKbJAWCMWEYDfWftSHFJkejuA",
      authDomain: "bhs-edoc-2.firebaseapp.com",
      projectId: "bhs-edoc-2",
      storageBucket: "bhs-edoc-2.firebasestorage.app",
      messagingSenderId: "741314713509",
      appId: "1:741314713509:web:42203869d175cd4fb6ba4c",
      measurementId: "G-RQ6LXD3XGY",
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'bhs-edoc-app';

const USERS_PATH = 'bhs_users';
const DOCS_PATH = 'bhs_documents';
const SETTINGS_PATH = 'bhs_settings';
const ORDER_RESERVE_PATH = 'bhs_order_reservations';
const OUTGOING_RESERVE_PATH = 'bhs_outgoing_reservations';
const AUDIT_LOG_PATH = 'bhs_audit_logs';
const COUNTERS_PATH = 'bhs_number_counters';
const REMINDERS_PATH = 'bhs_reminders';

const getCollectionRef = (collectionName) => collection(db, 'artifacts', appId, 'public', 'data', collectionName);
const getDocumentRef = (collectionName, documentId) => doc(db, 'artifacts', appId, 'public', 'data', collectionName, documentId);

const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbybUep1zqPvNXMaed11u7bibs7SaOWNsfgrpm1d3Wz8jh8eql9ljOU6MyygE2nrPmsIPg/exec";

const ROLES = {
  ADMIN: { id: "admin", name: "ผู้ดูแลระบบ", level: 99 },
  DIRECTOR: { id: "director", name: "ผู้อำนวยการ", level: 20 },
  DEPUTY: { id: "deputy", name: "รองผู้อำนวยการ", level: 15 },
  CLERK: { id: "clerk", name: "เจ้าหน้าที่ธุรการ", level: 5 },
  TEACHER: { id: "teacher", name: "ครูและบุคลากร", level: 1 },
};

const DOC_STATUS = {
  WAITING_DEPUTY: "รอรองผู้อำนวยการ",
  WAITING_DIRECTOR: "รอผู้อำนวยการ",
  COMPLETED: "อนุมัติ/สั่งการแล้ว",
  PUBLISHED: "เผยแพร่แล้ว",
  RETURNED: "ส่งกลับแก้ไข",
};

const DEFAULT_SETTINGS = {
  schoolName: "โรงเรียนบ้านแฮดศึกษา",
  schoolLogoText: "บ.ศ.",
  academicYear: "2567",
  fiscalYear: "2567",
  adminDepts: [
    "กลุ่มบริหารวิชาการ",
    "กลุ่มบริหารงานบุคคล",
    "กลุ่มบริหารงานงบประมาณและอำนวยการ",
    "กลุ่มบริหารงานทั่วไป",
    "กลุ่มบริหารงานกิจการนักเรียน",
  ],
  adminHeads: {},
  subjectHeads: {},
  subjectAreas: [
    "ภาษาไทย",
    "คณิตศาสตร์",
    "วิทยาศาสตร์และเทคโนโลยี",
    "สังคมศึกษา ศาสนา และวัฒนธรรม",
    "สุขศึกษาและพลศึกษา",
    "ศิลปะ",
    "การงานอาชีพ",
    "ภาษาต่างประเทศ",
    "ไม่มีกลุ่มสาระการเรียนรู้",
  ]
};

const initialUsers = [
  { id: "U01", name: "นายกฤษฎา สินธพ", username: "admin", role: "admin", adminDept: "กลุ่มบริหารงานบุคคล", subjectArea: "สุขศึกษาและพลศึกษา", status: "active" },
  { id: "U02", name: "ผอ.สัญญา ประชากูล", username: "director", role: "director", adminDept: "-", subjectArea: "-", status: "active" },
  { id: "U03", name: "รองฯชยางกูร ข้อยุ่น", username: "deputy", role: "deputy", adminDept: "-", subjectArea: "-", status: "active" },
  { id: "U04", name: "นางสาวกันตนา จ่าภา", username: "clerk", role: "clerk", adminDept: "กลุ่มบริหารงานงบประมาณและอำนวยการ", subjectArea: "ไม่มีกลุ่มสาระการเรียนรู้", status: "active" },
  { id: "U05", name: "ครูสมปอง รักเรียน", username: "teacher1", role: "teacher", adminDept: "กลุ่มบริหารวิชาการ", subjectArea: "วิทยาศาสตร์และเทคโนโลยี", status: "active" },
];

function getTodayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function formatThaiDate(dateString) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}
function formatDateTime(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function getThaiDateLong() {
  return new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
}

function StatusBadge({ status }) {
  let color = "bg-gray-100 text-gray-800 border-gray-200";
  if (status === DOC_STATUS.WAITING_DEPUTY || status === DOC_STATUS.WAITING_DIRECTOR) color = "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (status === DOC_STATUS.COMPLETED || status === DOC_STATUS.PUBLISHED) color = "bg-green-100 text-green-800 border-green-200";
  if (status === DOC_STATUS.RETURNED) color = "bg-red-100 text-red-800 border-red-200";
  return (
    <span className={`px-2.5 py-1 inline-flex text-[11px] font-bold rounded-full border shadow-sm ${color}`}>
      {status}
    </span>
  );
}

const writeAuditLog = async (user, action, targetType, targetId, detail = "") => {
  if (!user) return;
  try {
    const logId = `AUDIT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    await setDoc(getDocumentRef(AUDIT_LOG_PATH, logId), {
      action,
      userId: user.id,
      userName: user.name,
      role: user.role,
      targetType,
      targetId,
      detail,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error("Audit log error:", err);
  }
};

// Atomic Firestore state changes: the document update and the audit entry commit together.
const auditPayload = (user, action, targetType, targetId, detail = "") => ({
  action, userId: user.id, userName: user.name, role: user.role,
  targetType, targetId, detail, timestamp: Date.now()
});
const commitDocumentWithAudit = async (user, docId, updates, action, detail) => {
  const batch = writeBatch(db);
  batch.update(getDocumentRef(DOCS_PATH, docId), updates);
  batch.set(doc(getCollectionRef(AUDIT_LOG_PATH)), auditPayload(user, action, "DOCUMENT", docId, detail));
  await batch.commit();
};
const fileIdentity = (item) => JSON.stringify([(item.files||[]).map(f=>f.driveId||f.url||f.name),item.activeFileVersion||1,item.status]);
const commitCheckedAction = async (user, item, updates, action, detail) => {
  const ref=getDocumentRef(DOCS_PATH,item.id);
  await runTransaction(db,async tx=>{
    const fresh=await tx.get(ref);
    if(!fresh.exists())throw new Error("ไม่พบเอกสารล่าสุดในฐานข้อมูล");
    if(fileIdentity(fresh.data())!==fileIdentity(item))
      throw new Error("เอกสารหรือไฟล์ PDF มีการเปลี่ยนแปลง กรุณาปิดหน้านี้แล้วเปิดฉบับล่าสุดก่อนดำเนินการ");
    tx.update(ref,updates);
    tx.set(doc(getCollectionRef(AUDIT_LOG_PATH)),auditPayload(user,action,"DOCUMENT",item.id,detail));
  });
};
const buddhistYear = (isoDate) => Number(String(isoDate || "").slice(0, 4)) + 543;
const getNumberYear = (value) => Number(String(value || "").split("/")[1]);
const uniqueId = (prefix = "ITEM") => `${prefix}-${crypto.randomUUID()}`;

// The number cursor is admin-controlled. Only VISIBLE records block a number.
// Read active records from the server and serialize all new writes through the yearly counter.
async function reserveSequentialNumber({ kind, collectionName, numberField, dateField, dateValue, data, user }) {
  const year=buddhistYear(dateValue);
  if(!Number.isInteger(year)||year<2500||year>2999)throw new Error("วันที่ไม่ถูกต้อง");
  const counterRef=getDocumentRef(COUNTERS_PATH,`${kind}-${year}`);
  const [before,rows,docs]=await Promise.all([
    getDocFromServer(counterRef),
    getDocsFromServer(getCollectionRef(collectionName)),
    getDocsFromServer(getCollectionRef(DOCS_PATH))
  ]);
  const occupied=occupiedRegisterNumbers(kind,rows.docs.map(x=>({id:x.id,...x.data()})),
    docs.docs.map(x=>({id:x.id,...x.data()})));
  const start=before.exists()?(Number(before.data().lastNumber)||0)+1:1;
  const next=nextAvailableNumber(start,year,occupied);
  const newRef=getDocumentRef(collectionName,uniqueId(kind));
  return runTransaction(db,async tx=>{
    const live=await tx.get(counterRef);
    if(live.exists()!==before.exists() ||
       registerCounterStamp(live.exists()?live.data():null)!==registerCounterStamp(before.exists()?before.data():null))
      throw new Error("มีการจองเลขหรือแก้เลขระหว่างตรวจสอบ กรุณากดบันทึกอีกครั้ง");
    // Commit the number, cursor and audit atomically. No historical rows are overwritten.
    const now=Date.now(),revision=(Number(live.exists()?live.data().revision:0)||0)+1;
    tx.set(counterRef,{lastNumber:next.sequence,kind,year,revision,updatedAt:now},{merge:true});
    tx.set(newRef,{...data,[numberField]:next.text,[dateField]:dateValue,status:"reserved",
      createdBy:user.id,responsibleName:user.name,createdAt:now,
      history:[{action:"จองเลข",by:user.id,time:now,subject:data.subject}]});
    tx.set(doc(getCollectionRef(AUDIT_LOG_PATH)),
      auditPayload(user,"ออกเลขอัตโนมัติ",kind,newRef.id,`เลข ${next.text} / ${data.subject}`));
    return next.text;
  });
}

function PageNavigator({ page, setPage, total, pageSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="flex items-center justify-between gap-2 p-3 border-t bg-gray-50 text-xs sm:text-sm">
    <span>รายการ {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} จาก {total}</span>
    <div className="flex items-center gap-2">
      <button className="border rounded px-3 py-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(p => Math.max(1,p-1))}>ก่อนหน้า</button>
      <span>หน้า {page}/{pages}</span>
      <button className="border rounded px-3 py-1.5 disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(p => Math.min(pages,p+1))}>ถัดไป</button>
    </div>
  </div>;
}
function SuccessNumberDialog({ number, label, onClose }) {
  if (!number) return null;
  return <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
    <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl p-6 text-center space-y-4">
      <CheckCircle className="mx-auto text-green-600" size={42}/>
      <h3 className="font-bold text-lg">{label || "บันทึกสำเร็จ"}</h3>
      <p className="text-3xl font-bold text-[#003366]">{number}</p>
      <p className="text-sm text-gray-600">ระบบยืนยันเลขนี้จากฐานข้อมูลเรียบร้อยแล้ว</p>
      <button className="bg-[#003366] text-white px-4 py-2 rounded-lg w-full" onClick={onClose}>ตกลง</button>
    </div>
  </div>;
}

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = (error) => reject(error);
});

const uploadFileToGoogleDrive = async (file) => {
  try {
    const base64DataUrl = await fileToBase64(file);
    const base64Str = base64DataUrl.split(',')[1]; 

    const payload = {
      fileName: file.name,
      mimeType: file.type,
      base64: base64Str
    };

    const response = await fetch(GAS_WEB_APP_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    if (!result.success) throw new Error(result.error || "Upload failed in Apps Script");

    return {
      name: result.fileName,
      size: `${(result.fileSize / 1024 / 1024).toFixed(2)} MB`,
      type: file.type.includes("pdf") ? "PDF" : "IMG",
      url: result.fileUrl,
      driveId: result.fileId
    };
  } catch (error) {
    console.error("Upload error:", error);
    throw error;
  }
};

const uploadMultipleFilesToDrive = async (filesArray, onProgressUpdate) => {
  const uploadedFiles = [];
  for (let i = 0; i < filesArray.length; i++) {
    if (onProgressUpdate) onProgressUpdate(`กำลังอัปโหลดไฟล์... (${i + 1}/${filesArray.length})`);
    const fileData = await uploadFileToGoogleDrive(filesArray[i]);
    uploadedFiles.push(fileData);
  }
  return uploadedFiles;
};

const Toast = ({ message, type = "info", onClose }) => {
  if (!message) return null;
  const bg = type === "error" ? "bg-red-500" : type === "success" ? "bg-green-500" : "bg-blue-500";
  return (
    <div className={`fixed top-4 right-4 z-[9999] ${bg} text-white px-4 py-3 rounded shadow-lg flex items-center gap-3 animate-fade-in mx-4 max-w-[90%] md:max-w-md`}>
      {type === "error" && <AlertCircle size={18} className="shrink-0" />}
      {type === "success" && <CheckCircle size={18} className="shrink-0" />}
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-75 shrink-0"><X size={16} /></button>
    </div>
  );
};

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [activeProfile, setActiveProfile] = useState(null);
  const [dbUsers, setDbUsers] = useState([]);
  const [systemSettings, setSystemSettings] = useState(null);
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState(null);
  
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (msg, type = "info") => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
      body { font-family: 'Sarabun', sans-serif; background-color: #f8fafc; overflow-x: hidden; }
      .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
      .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(0, 51, 102, 0.2); border-radius: 10px; }
      @keyframes fade-in { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  useEffect(() => {
    let unsubscribeAuth;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenErr) {
            console.warn("Custom token mismatch, falling back to anonymous login.");
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
      }
      unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        setFirebaseUser(user);
      });
    };
    initAuth();

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;

    const unsubSettings = onSnapshot(getDocumentRef(SETTINGS_PATH, 'system'), (docSnap) => {
        if(docSnap.exists()) {
            setSystemSettings(docSnap.data());
        } else {
            setSystemSettings(DEFAULT_SETTINGS);
        }
        setIsInitializing(false);
    }, (error) => {
        console.error("Settings Fetch Error:", error);
        setInitError("ไม่สามารถโหลดฐานข้อมูล Firestore ได้ โปรดตรวจสอบว่า Firestore Rules อนุญาตให้อ่านข้อมูลหรือไม่");
        setIsInitializing(false);
    });

    return () => unsubSettings();
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(getCollectionRef(USERS_PATH), (snapshot) => {
      setDbUsers(snapshot.docs.map((d) => d.data()));
    }, (error) => console.error("Fetch Users Error:", error));
    return () => unsub();
  }, [firebaseUser]);

  const handleLogin = (e) => {
    e.preventDefault();
    setLoading(true);
    const user = dbUsers.find(u => u.username === username.trim());
    // Legacy login remains usable if the optional secure signing service is
    // not configured yet. Only director/admin get a short-lived signing cookie.
    setTimeout(async () => {
      try {
        if (!user) return showToast("ไม่พบชื่อผู้ใช้งานนี้", "error");
        if (user.status === "inactive") return showToast("บัญชีนี้ถูกระงับการใช้งาน", "error");
        const userPassword = user.password || "123456";
        if (password !== userPassword) return showToast("รหัสผ่านไม่ถูกต้อง", "error");
        if (["director","admin"].includes(user.role)) {
          const controller=new AbortController();
          const timeout=setTimeout(()=>controller.abort(),6000);
          try {
            // Server independently checks the password and current role.
            await fetch("/api/signing-session",{
              method:"POST",headers:{"Content-Type":"application/json"},
              credentials:"same-origin",
              body:JSON.stringify({username:username.trim(),password}),
              signal:controller.signal,
            });
          } catch(error) {
            console.warn("Automatic signing session unavailable; manual PDF selection remains available.");
          } finally {clearTimeout(timeout);}
        }
        setActiveProfile(user);
        writeAuditLog(user, "เข้าสู่ระบบ", "AUTH", user.id, "เข้าสู่ระบบสำเร็จ");
        if (userPassword !== "123456") showToast(`เข้าสู่ระบบสำเร็จ: ${user.name}`, "success");
      } finally {setLoading(false);}
    }, 500);
  };

  const handleLogout = () => {
    void fetch("/api/signing-session",{method:"DELETE",credentials:"same-origin"}).catch(()=>{});
    if (activeProfile) {
      writeAuditLog(activeProfile, "ออกจากระบบ", "AUTH", activeProfile.id, "ออกจากระบบสำเร็จ");
    }
    setActiveProfile(null);
    setUsername("");
    setPassword("");
  };

  const setupInitialData = async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      for (const u of initialUsers) {
        await setDoc(getDocumentRef(USERS_PATH, u.id), u);
      }
      await setDoc(getDocumentRef(SETTINGS_PATH, 'system'), DEFAULT_SETTINGS);
      showToast("ติดตั้งระบบสำเร็จ! กรุณาล็อกอินด้วยบัญชี admin", "success");
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
    setLoading(false);
  };

  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-6 rounded-xl shadow-lg border border-red-200 text-center max-w-md animate-fade-in">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">เกิดข้อผิดพลาดในการเริ่มต้นระบบ</h2>
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{initError}</p>
        </div>
      </div>
    );
  }

  if (isInitializing || !systemSettings) {
    return (
      <div className="min-h-screen flex flex-col gap-4 items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-[#003366]" size={40} />
        <p className="text-sm font-bold text-gray-500">กำลังเชื่อมต่อฐานข้อมูล...</p>
      </div>
    );
  }

  if (!activeProfile) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
        {toastMsg && <Toast message={toastMsg.msg} type={toastMsg.type} onClose={() => setToastMsg(null)} />}
        <div className="absolute inset-0 bg-[#003366]/5"></div>
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden z-10 border border-gray-100">
          <div className="bg-[#003366] p-6 sm:p-8 text-center relative overflow-hidden">
            <div className="relative z-10 w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 shadow-lg border-2 border-[#D4AF37]">
              <span className="text-[#003366] font-bold text-2xl sm:text-3xl">{systemSettings.schoolLogoText || "บ.ศ."}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#D4AF37] relative z-10">ระบบสารบรรณอิเล็กทรอนิกส์</h1>
            <p className="text-blue-100 text-xs sm:text-sm mt-1 relative z-10">{systemSettings.schoolName || "โรงเรียนบ้านแฮดศึกษา"}</p>
          </div>

          <div className="p-6 sm:p-8">
            <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Username</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="กรอกชื่อผู้ใช้งาน (เช่น admin)"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                  <input
                    type="password"
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="รหัสผ่าน"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || dbUsers.length === 0}
                className="w-full bg-[#003366] hover:bg-blue-900 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-colors flex justify-center items-center disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : "เข้าสู่ระบบ"}
              </button>
            </form>

            {dbUsers.length === 0 && (
              <div className="mt-6 pt-6 border-t border-gray-100 text-center">
                <p className="text-xs text-red-500 font-bold mb-2">ยังไม่มีข้อมูลเริ่มต้นในฐานข้อมูล</p>
                <button onClick={setupInitialData} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 px-4 rounded shadow">
                  คลิกเพื่อติดตั้งข้อมูลจำลอง
                </button>
              </div>
            )}

            {dbUsers.length > 0 && (
              <div className="mt-8 pt-6 border-t border-gray-100">
                <p className="text-xs text-gray-500 font-bold mb-3 uppercase tracking-wider text-center">บัญชีทดสอบ (คลิกเพื่อเข้าสู่ระบบ)</p>
                <div className="flex flex-wrap justify-center gap-2 text-xs">
                  {dbUsers.slice(0, 5).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setUsername(u.username);
                        setPassword(u.password || "123456");
                      }}
                      className="p-2 bg-gray-50 border border-gray-200 rounded hover:bg-blue-50 hover:border-blue-200 text-left transition-colors"
                    >
                      <span className="font-bold block text-blue-800">{u.username}</span>
                      <span className="text-[10px] text-gray-500">{ROLES[(u.role||"teacher").toUpperCase()]?.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {toastMsg && <Toast message={toastMsg.msg} type={toastMsg.type} onClose={() => setToastMsg(null)} />}
      <MainLayout
        firebaseUser={firebaseUser}
        currentUser={activeProfile}
        dbUsers={dbUsers}
        systemSettings={systemSettings}
        onLogout={handleLogout}
        showToast={showToast}
      />
    </>
  );
}

function MainLayout({ firebaseUser, currentUser, dbUsers, systemSettings, onLogout, showToast }) {
  const [documents, setDocuments] = useState([]);
  const [orderReservations, setOrderReservations] = useState([]);
  const [outgoingReservations, setOutgoingReservations] = useState([]);
  const [reminders,setReminders] = useState([]);
  const [activeMenu, setActiveMenu] = useState("dashboard");
  const [focusDocId,setFocusDocId]=useState(null);
  const [notifFilter,setNotifFilter]=useState("all");
  const [notifQuery,setNotifQuery]=useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [changePasswordModal, setChangePasswordModal] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  
  const [soundVolume,setSoundVolume]=useState(()=>{try{const v=localStorage.getItem("bhs-edoc-volume");return v===null?50:Math.max(0,Math.min(100,Number(v)||0))}catch{return 50}});
  const soundEnabled=soundVolume>0;
  useEffect(()=>{try{localStorage.setItem("bhs-edoc-volume",String(soundVolume))}catch{}},[soundVolume]);
  useEffect(()=>{
    const onOffline=()=>showToast("การเชื่อมต่อขาดหาย กรุณาตรวจสอบก่อนบันทึก","error");
    const onOnline=()=>showToast("กลับมาเชื่อมต่ออินเทอร์เน็ตแล้ว","success");
    window.addEventListener("offline",onOffline);window.addEventListener("online",onOnline);
    return ()=>{window.removeEventListener("offline",onOffline);window.removeEventListener("online",onOnline)};
  },[]);
  useEffect(()=>{if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});},[]);
  const [lastNotifTime, setLastNotifTime] = useState(Date.now());

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(getCollectionRef(DOCS_PATH), (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      docs.sort((a, b) => b.createdAt - a.createdAt);
      setDocuments(docs);
    }, (err) => showToast("Error fetching documents: " + err.message, "error"));
    
    const unsubRes = onSnapshot(getCollectionRef(ORDER_RESERVE_PATH), (snapshot) => {
      const res = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      res.sort((a, b) => b.createdAt - a.createdAt);
      setOrderReservations(res);
    }, (err) => console.error("Error fetching order reservations", err));

    const unsubReminder=onSnapshot(getCollectionRef(REMINDERS_PATH), snapshot => {
      setReminders(snapshot.docs.map(item=>({id:item.id,...item.data()})));
    }, err=>console.warn("Reminder listener",err));
    const unsubOutRes = onSnapshot(getCollectionRef(OUTGOING_RESERVE_PATH), (snapshot) => {
      const res = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      res.sort((a, b) => b.createdAt - a.createdAt);
      setOutgoingReservations(res);
    }, (err) => console.error("Error fetching outgoing reservations", err));

    return () => {
      unsub();
      unsubRes();
      unsubOutRes();
      unsubReminder();
    };
  }, [firebaseUser]);

  const activeDocs = documents.filter(d => !d.isDeleted);
  const managedGroups=headGroups(currentUser,systemSettings);
  const {route:routeDocument,headAction,acknowledge:ackDocument,acknowledgeAssignment:ackAssignment}=makeRoutingActions({
    db,getDocumentRef,getCollectionRef,paths:{documents:DOCS_PATH,audit:AUDIT_LOG_PATH},
    user:currentUser,users:dbUsers,settings:systemSettings,showToast
  });
  const openDocument=id=>{
    const d=activeDocs.find(x=>x.id===id);
    if(!d)return showToast("ไม่พบเอกสาร","error");
    if(!(canReadDoc(currentUser,d,dbUsers)||canViewRouted(currentUser,d,dbUsers,systemSettings)||(currentUser.role==="deputy"&&d.status===DOC_STATUS.WAITING_DEPUTY)))
      return showToast("ไม่มีสิทธิ์ดูเอกสาร","error");
    setFocusDocId(id);setActiveMenu("document_detail");setIsNotifOpen(false);
  };
  useEffect(()=>{
    const id=new URLSearchParams(window.location.search).get("doc");
    if(id&&activeDocs.some(d=>d.id===id))openDocument(id);
  },[documents.length,currentUser.id]);
  useEffect(()=>{
    if(!("setAppBadge" in navigator))return;
    const n=activeDocs.filter(d=>isFinalDoc(d)&&canViewRouted(currentUser,d,dbUsers,systemSettings)&&!(d.acknowledgedBy||[]).includes(currentUser.id)).length
      +activeDocs.reduce((sum,d)=>sum+pendingAssignmentEvents(d,currentUser).length+pendingHeadGroups(d,currentUser,systemSettings).length,0);
    Promise.resolve(navigator.setAppBadge(n)).catch(()=>{});
  },[documents,currentUser.id,dbUsers,systemSettings]);
  const openedDoc=activeDocs.find(d=>d.id===focusDocId);
  const documentAlerts=routingAlerts(activeDocs,currentUser,systemSettings);
  const assignmentCount=activeDocs.reduce((n,d)=>n+pendingAssignmentEvents(d,currentUser).length,0);
  const headCount=activeDocs.reduce((n,d)=>n+pendingHeadGroups(d,currentUser,systemSettings).length,0);

  const isUserInTarget = (user, docObj) => {
    if (!docObj.assignedTo || docObj.assignedTo === "ทุกคน") return true;
    return user.adminDept === docObj.assignedTo || user.subjectArea === docObj.assignedTo;
  };

  const notifications = [];
  const targetMatch = d => Array.isArray(d.recipientsSnapshot)
     ? isRecipient(d,currentUser,dbUsers)
     : isUserInTarget(currentUser,d);
  
  const pendingTasks = activeDocs.filter(doc => {
    if (currentUser.role === "deputy" && doc.status === DOC_STATUS.WAITING_DEPUTY) return true;
    if (currentUser.role === "director" && doc.status === DOC_STATUS.WAITING_DIRECTOR) return true;
    if (currentUser.role === "admin" && (doc.status === DOC_STATUS.WAITING_DEPUTY || doc.status === DOC_STATUS.WAITING_DIRECTOR)) return true;
    return false;
  });
  pendingTasks.forEach(doc => {
    notifications.push({ docId:doc.id,id: `task-${doc.id}`, title: "งานรอพิจารณา/ลงนาม", desc: doc.subject, type: "warning", time: eventTime(doc,doc.status===DOC_STATUS.WAITING_DIRECTOR?"director":"deputy"), targetMenu: "tasks" });
  });

  const returnedDocs = activeDocs.filter(doc => doc.createdBy === currentUser.id && doc.status === DOC_STATUS.RETURNED);
  returnedDocs.forEach(doc => {
    notifications.push({ docId:doc.id,id: `ret-${doc.id}`, title: "เอกสารส่งกลับแก้ไข", desc: doc.subject, type: "error", time: eventTime(doc,"returned"), targetMenu: "mydocs" });
  });

  const isAcknowledgeRole = ["clerk", "teacher"].includes(currentUser.role);
  if (isAcknowledgeRole) {
    const unreadIncoming = activeDocs.filter(doc => doc.type === "หนังสือเข้า" && (doc.status === DOC_STATUS.COMPLETED || doc.status === DOC_STATUS.PUBLISHED) && !doc.acknowledgedBy?.includes(currentUser.id) && targetMatch(doc));
    unreadIncoming.forEach(doc => {
      notifications.push({ docId:doc.id,id: `inc-${doc.id}`, title: "หนังสือเข้าใหม่", desc: doc.subject, type: "info", time: eventTime(doc,"published"), targetMenu: "incoming" });
    });

    const unreadOrders = activeDocs.filter(doc => doc.type === "คำสั่งโรงเรียน" && (doc.status === DOC_STATUS.COMPLETED || doc.status === DOC_STATUS.PUBLISHED) && !doc.acknowledgedBy?.includes(currentUser.id) && targetMatch(doc));
    unreadOrders.forEach(doc => {
      notifications.push({ docId:doc.id,id: `ord-${doc.id}`, title: "คำสั่งโรงเรียนใหม่", desc: doc.subject, type: "info", time: eventTime(doc,"published"), targetMenu: "orders" });
    });

    const unreadCirculars = activeDocs.filter(doc => doc.type === "หนังสือเวียนแจ้งรับทราบ" && (doc.status === DOC_STATUS.COMPLETED || doc.status === DOC_STATUS.PUBLISHED) && !doc.acknowledgedBy?.includes(currentUser.id) && targetMatch(doc));
    unreadCirculars.forEach(doc => {
      notifications.push({ docId:doc.id,id: `circ-${doc.id}`, title: "หนังสือเวียนแจ้งรับทราบใหม่", desc: doc.subject, type: "info", time: eventTime(doc,"published"), targetMenu: "circulars" });
    });
  }

  reminders.filter(r=>r.targetUserId===currentUser.id &&
    activeDocs.some(d=>d.id===r.docId&&!d.acknowledgedBy?.includes(currentUser.id))).forEach(r=>notifications.push({
    docId:r.docId,id:r.id,title:"แจ้งเตือนให้รับทราบเอกสาร",desc:r.subject||r.docNumber,
    type:"warning",time:r.createdAt||0,targetMenu:r.targetMenu||"orders"
  }));
  notifications.push(...documentAlerts);
  notifications.sort((a, b) => b.time - a.time);
  const notificationHistory=[
    ...routingHistory(activeDocs,currentUser,systemSettings),
    ...activeDocs.filter(d=>isFinalDoc(d)&&(canReadDoc(currentUser,d,dbUsers)||canViewRouted(currentUser,d,dbUsers,systemSettings)))
      .map(d=>({id:"history-published:"+d.id,docId:d.id,title:"หนังสือเผยแพร่แล้ว",desc:d.subject,time:d.publishedAt||d.createdAt||0,type:"info"}))
  ].sort((a,b)=>b.time-a.time);

  const shownNotifications=(notifFilter==="history"?notificationHistory:notifications.filter(n=>notifFilter==="all"||(notifFilter==="tasks"?n.id.startsWith("assignment:")||n.id.startsWith("head:")||n.id.startsWith("task-"):n.id.startsWith("inc-")||n.id.startsWith("ord-")||n.id.startsWith("circ-")||n.id.startsWith("rem-")))).filter(n=>(n.title+" "+n.desc).toLocaleLowerCase("th-TH").includes(notifQuery.toLocaleLowerCase("th-TH")));
  const latestNotifTime = notifications.length > 0 ? notifications[0].time : 0;
  useEffect(() => {
    if (latestNotifTime > lastNotifTime) {
      if (soundEnabled) {
        playNotification(soundVolume).catch(()=>{});
      }
      setLastNotifTime(latestNotifTime);
    }
  }, [latestNotifTime, lastNotifTime, soundEnabled, soundVolume]);

  const incomingUnreadCount = isAcknowledgeRole ? activeDocs.filter(doc => doc.type === "หนังสือเข้า" && (doc.status === DOC_STATUS.COMPLETED || doc.status === DOC_STATUS.PUBLISHED) && !doc.acknowledgedBy?.includes(currentUser.id) && targetMatch(doc)).length : 0;
  const ordersUnreadCount = isAcknowledgeRole ? activeDocs.filter(doc => doc.type === "คำสั่งโรงเรียน" && (doc.status === DOC_STATUS.COMPLETED || doc.status === DOC_STATUS.PUBLISHED) && !doc.acknowledgedBy?.includes(currentUser.id) && targetMatch(doc)).length : 0;
  const circularsUnreadCount = isAcknowledgeRole ? activeDocs.filter(doc => doc.type === "หนังสือเวียนแจ้งรับทราบ" && (doc.status === DOC_STATUS.COMPLETED || doc.status === DOC_STATUS.PUBLISHED) && !doc.acknowledgedBy?.includes(currentUser.id) && targetMatch(doc)).length : 0;

  const menus = [
    { id: "dashboard", label: "หน้าหลัก", icon: <LayoutDashboard size={20} />, roles: ["admin", "director", "deputy", "clerk", "teacher"] },
    { id: "global_search", label: "ค้นหาเอกสารทั้งหมด", icon: <Search size={20}/>, roles: ["admin","director","deputy","clerk","teacher"] },
    { id: "pending_report", label: "ติดตามงานค้าง", icon: <History size={20}/>, roles: ["admin","director","deputy","clerk","teacher"] },
    { id: "ack_report", label: "รายงานการรับทราบ", icon: <CheckCircle size={20}/>, roles: ["admin","director","deputy"] },
    { id: "export_register", label: "ส่งออกทะเบียน Excel/PDF", icon: <Download size={20}/>, roles: ["admin","director","deputy","clerk","teacher"] },
    { id:"routing",label:"หนังสือรอเกษียณต่อ",icon:<FileSignature size={20}/>,roles:["admin","director","deputy","clerk","teacher"],badge:headCount },
    { id:"assignments",label:"งานที่ได้รับมอบหมาย",icon:<CheckCircle size={20}/>,roles:["admin","director","deputy","clerk","teacher"],badge:assignmentCount },
    { id: "tasks", label: "งานที่ต้องดำเนินการ", icon: <FileSignature size={20} />, roles: ["admin", "director", "deputy"], badge: pendingTasks.length },
    { id: "incoming", label: "ทะเบียนหนังสือเข้า", icon: <Inbox size={20} />, roles: ["admin", "director", "deputy", "clerk", "teacher"], badge: incomingUnreadCount },
    { id: "order_reservations", label: "เลขคำสั่งโรงเรียน", icon: <Hash size={20} />, roles: ["admin", "director", "deputy", "clerk", "teacher"] },
    { id: "orders", label: "คำสั่งโรงเรียน", icon: <FileText size={20} />, roles: ["admin", "director", "deputy", "clerk", "teacher"], badge: ordersUnreadCount },
    { id: "outgoing_reservations", label: "ขอเลขที่หนังสือออก", icon: <FileUp size={20} />, roles: ["admin", "director", "deputy", "clerk", "teacher"] },
    { id: "circulars", label: "หนังสือเวียนแจ้งรับทราบ", icon: <Bell size={20} />, roles: ["admin", "director", "deputy", "clerk", "teacher"], badge: circularsUnreadCount },
    { id: "mydocs", label: "เอกสารที่ดำเนินการ", icon: <Send size={20} />, roles: ["admin", "clerk", "teacher"] },
    { id: "users", label: "จัดการผู้ใช้งาน", icon: <Users size={20} />, roles: ["admin"] },
    { id: "settings", label: "ตั้งค่าระบบ", icon: <Settings size={20} />, roles: ["admin"] },
    { id: "audit", label: "Audit Log (ประวัติกิจกรรม)", icon: <ClipboardList size={20} />, roles: ["admin"] },
    { id: "trash", label: "ถังขยะ", icon: <Trash2 size={20} />, roles: ["admin"] },
  ];

  const allowedMenus = menus.filter((m) => m.roles.includes(currentUser.role) &&
    shouldShowRoleMenu(m.id,currentUser.role,managedGroups.length>0));

  const navSections = [
    { title:"ภาพรวม",ids:["dashboard"] },
    { title:"งานของฉัน",ids:["tasks","routing","assignments","mydocs"] },
    { title:"งานสารบรรณ",ids:["incoming","order_reservations","orders","outgoing_reservations","circulars"] },
    { title:"รายงาน",ids:["ack_report"] },
    { title:"บริหารระบบ",ids:["users","settings","audit","trash"] },
    { title:"เครื่องมือเพิ่มเติม",ids:["export_register"] }
  ];

  // Render directly instead of declaring a nested React component: otherwise
  // every MainLayout render remounts the nav and resets its scroll position.
  const renderSidebarContent = () => (
    <>
      <div className="bhs-luxury-brand">
        <div className="bhs-luxury-emblem" aria-hidden="true">
          <span>{systemSettings.schoolLogoText || "บ.ศ."}</span>
        </div>
        <div className="bhs-luxury-brand-copy">
          <div className="bhs-luxury-wordmark">BHS <span>E-DOCUMENT</span></div>
          <div className="bhs-luxury-subbrand">ระบบสารบรรณอิเล็กทรอนิกส์</div>
          <div className="bhs-luxury-school" title={systemSettings.schoolName || "โรงเรียนบ้านแฮดศึกษา"}>
            {systemSettings.schoolName || "โรงเรียนบ้านแฮดศึกษา"}
          </div>
        </div>
      </div>
      <div className="bhs-luxury-nav custom-scrollbar">
        {navSections.map(section => {
          const entries = allowedMenus.filter(m => section.ids.includes(m.id));
          if (!entries.length) return null;
          return (
            <section key={section.title} className="bhs-luxury-nav-section">
              <p className="bhs-luxury-nav-caption">{section.title}</p>
              <nav aria-label={section.title}>
                {entries.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setActiveMenu(m.id); setIsMobileMenuOpen(false); }}
                    aria-current={activeMenu === m.id ? "page" : undefined}
                    className={`bhs-luxury-nav-link ${activeMenu === m.id ? "is-active" : ""}`}
                  >
                    <span className={"bhs-luxury-nav-icon bhs-nav-icon-"+m.id}>{m.icon}</span>
                    <span className="bhs-luxury-nav-text">{m.label}</span>
                    {m.badge > 0 && <span className="bhs-luxury-nav-count">{m.badge > 99 ? "99+" : m.badge}</span>}
                  </button>
                ))}
              </nav>
            </section>
          );
        })}
      </div>
      <div className="bhs-luxury-account">
        <div className="bhs-luxury-avatar">{currentUser.name.charAt(0)}</div>
        <div className="bhs-luxury-account-info">
          <div className="bhs-luxury-account-name" title={currentUser.name}>{currentUser.name}</div>
          <div className="bhs-luxury-account-role">{ROLES[currentUser.role.toUpperCase()]?.name}</div>
          <RoleIndicators user={currentUser} settings={systemSettings} compact/>
        </div>
        <button type="button" onClick={() => setChangePasswordModal(true)} className="bhs-luxury-account-control" title="เปลี่ยนรหัสผ่าน" aria-label="เปลี่ยนรหัสผ่าน"><KeyRound size={17}/></button>
        <button type="button" onClick={onLogout} className="bhs-luxury-account-control" title="ออกจากระบบ" aria-label="ออกจากระบบ"><LogOut size={17}/></button>
      </div>
    </>
  );

  return (
    <div className="bhs-luxury-shell flex h-screen w-full overflow-hidden">
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={() => setIsMobileMenuOpen(false)}></div>
          <aside className="bhs-luxury-sidebar relative w-72 max-w-[85%] h-full z-50 flex flex-col">
            <button onClick={() => setIsMobileMenuOpen(false)} className="absolute top-4 right-4 text-blue-100 hover:text-white"><X size={24} /></button>
            {renderSidebarContent()}
          </aside>
        </div>
      )}
      
      <aside className="bhs-luxury-sidebar hidden md:flex flex-col w-[278px] shrink-0 z-20">
        {renderSidebarContent()}
      </aside>
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="bhs-luxury-topbar z-10 flex justify-between items-center px-4 md:px-8 h-[74px] shrink-0">
          <div className="flex items-center">
            <button onClick={() => setIsMobileMenuOpen(true)} className="text-gray-500 hover:text-gray-700 mr-4 md:hidden"><Menu size={24} /></button>
            <h2 className="text-lg font-semibold text-[#17324a] truncate md:hidden">{allowedMenus.find((m) => m.id === activeMenu)?.label}</h2><div className="hidden md:flex items-center gap-3"><span className="bhs-luxury-topbar-kicker">BHS / E-DOCUMENT</span><span className="bhs-luxury-topbar-divider"></span><span className="bhs-luxury-topbar-title">{allowedMenus.find((m) => m.id === activeMenu)?.label || "ระบบสารบรรณ"}</span></div>
          </div>
          
          <div className="flex items-center relative">
            <button onClick={() => setIsNotifOpen(!isNotifOpen)} className="relative p-2 text-gray-500 hover:text-blue-600 transition-colors rounded-full hover:bg-blue-50 outline-none focus:ring-2 focus:ring-blue-100">
              <Bell size={22} />
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-white text-[9px] font-bold items-center justify-center border border-white shadow-sm">{notifications.length > 9 ? '9+' : notifications.length}</span>
                </span>
              )}
            </button>

            {isNotifOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsNotifOpen(false)}></div>
                <div className="absolute right-0 top-12 mt-2 w-72 sm:w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-fade-in origin-top-right">
                  <div className="bg-slate-50 border-b border-gray-200 px-4 py-3 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 text-sm flex items-center"><Bell size={16} className="mr-1.5 text-blue-600"/> การแจ้งเตือน</h3>
                    <div className="flex items-center gap-2">
                       <label className="flex items-center gap-1 text-xs text-slate-600"><Volume2 size={15}/><input aria-label="ความดังเสียงแจ้งเตือน" type="range" min="0" max="100" step="5" value={soundVolume} onChange={e=>setSoundVolume(Number(e.target.value))} className="w-20 accent-blue-600"/><span>{soundVolume}%</span><button type="button" onClick={()=>playNotification(soundVolume)} className="text-blue-700 underline" title="ทดลองเสียง">ทดสอบ</button></label>
                       {notifications.length > 0 && <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-bold">{notifications.length} รายการ</span>}
                    </div>
                  </div>
                  <div className="px-3 py-2 flex gap-2 border-b">{[["all","ทั้งหมด"],["unread","รอรับทราบ"],["tasks","งานมอบหมาย"],["history","ย้อนหลัง"]].map(([k,v])=><button key={k} onClick={()=>setNotifFilter(k)} className={"px-2 py-1 rounded text-xs "+(notifFilter===k?"bg-blue-100 text-blue-700 font-bold":"text-slate-500")}>{v}</button>)}</div>
                  <div className="px-3 py-2 border-b"><input aria-label="ค้นหาการแจ้งเตือน" placeholder="ค้นหาชื่อเรื่องหรือข้อความแจ้งเตือน..." value={notifQuery} onChange={e=>setNotifQuery(e.target.value)} className="w-full border px-3 py-2 text-xs rounded-lg"/></div>
                  <div className="max-h-[60vh] overflow-y-auto custom-scrollbar bg-white">
                    {shownNotifications.length === 0 ? (
                      <div className="py-10 text-center text-gray-400 flex flex-col items-center">
                        <CheckCircle size={36} className="text-gray-200 mb-3"/>
                        <p className="text-sm font-medium">ไม่มีรายการในหมวดนี้</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {shownNotifications.map(notif => (
                          <div key={notif.id} className="p-3.5 hover:bg-blue-50 cursor-pointer transition-colors" onClick={() => {
                            setIsNotifOpen(false);
                            if(notif.docId)openDocument(notif.docId);else setActiveMenu(notif.targetMenu);
                          }}>
                            <div className="flex gap-3 items-start">
                               <div className={`mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center border shadow-sm ${notif.type === 'warning' ? 'bg-yellow-100 text-yellow-600 border-yellow-200' : notif.type === 'error' ? 'bg-red-100 text-red-600 border-red-200' : 'bg-blue-100 text-blue-600 border-blue-200'}`}>
                                 {notif.type === 'warning' && <FileSignature size={14} />}
                                 {notif.type === 'error' && <AlertCircle size={14} />}
                                 {notif.type === 'info' && <Bell size={14} className="fill-current" />}
                               </div>
                               <div className="min-w-0 flex-1">
                                 <p className="text-xs font-bold text-gray-800">{notif.title}</p>
                                 <p className="text-[11px] text-gray-600 truncate mt-0.5">{notif.desc}</p>
                                 <p className="text-[9px] text-gray-400 mt-1.5 font-medium">{formatDateTime(notif.time)}</p>
                               </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="bhs-luxury-main flex-1 overflow-y-auto custom-scrollbar p-4 md:p-7 xl:p-9 relative w-full">
          {activeMenu === "dashboard" && <><DashboardView documents={activeDocs} currentUser={currentUser} dbUsers={dbUsers} systemSettings={systemSettings} changeMenu={setActiveMenu} onOpenDocument={openDocument} showToast={showToast}/><div className="bhs-luxury-stats mt-6"><StatsDashboard documents={activeDocs} currentUser={currentUser} dbUsers={dbUsers} changeMenu={setActiveMenu}/></div></>}
          {activeMenu === "global_search" && <SearchCenter documents={activeDocs} orderReservations={orderReservations} outgoingReservations={outgoingReservations} currentUser={currentUser} dbUsers={dbUsers} changeMenu={setActiveMenu}/>} 
          {activeMenu === "pending_report" && <PendingReport documents={activeDocs} currentUser={currentUser}/>} 
          {activeMenu === "ack_report" && <AckReport documents={activeDocs} currentUser={currentUser} dbUsers={dbUsers} onAddRecipient={async (item,userId,reason)=>{
            const user=dbUsers.find(u=>u.id===userId);
            if(!user)throw new Error("ไม่พบผู้รับ");
            try {
              await runTransaction(db,async tx=>{
                const ref=getDocumentRef(DOCS_PATH,item.id),current=await tx.get(ref);
                if(!current.exists()||!Array.isArray(current.data().recipientsSnapshot)||![DOC_STATUS.PUBLISHED,DOC_STATUS.COMPLETED].includes(current.data().status))throw new Error("ข้อมูลเอกสารเปลี่ยนไป กรุณาลองใหม่");
                if(current.data().recipientsSnapshot.some(x=>x.id===userId))throw new Error("รายชื่อนี้อยู่ในผู้รับแล้ว");
                const entry={id:user.id,name:user.name,role:user.role,addedAt:Date.now(),addedBy:currentUser.id,reason};
                tx.update(ref,{recipientsSnapshot:[...current.data().recipientsSnapshot,entry],history:arrayUnion({action:"เพิ่มผู้รับภายหลัง",by:currentUser.id,byName:currentUser.name,timestamp:Date.now(),detail:`${user.name}: ${reason}`})});
                tx.set(doc(getCollectionRef(AUDIT_LOG_PATH)),auditPayload(currentUser,"เพิ่มรายชื่อผู้รับ","DOCUMENT",item.id,`${user.name}: ${reason}`));
              });
              showToast("เพิ่มผู้รับและบันทึกประวัติเรียบร้อยแล้ว","success");
            }catch(e){showToast(e.message,"error")}
          }} onReminder={async (item,recipient)=>{
            try {
              if(reminders.some(r=>r.docId===item.id&&r.targetUserId===recipient.id&&
                !item.acknowledgedBy?.includes(recipient.id)))throw new Error("ส่งแจ้งเตือนรายการนี้แล้ว กรุณารอการรับทราบ");
              const id=`rem-${item.id}-${recipient.id}-${Date.now()}`;
              const batch=writeBatch(db);
              batch.set(getDocumentRef(REMINDERS_PATH,id),{targetUserId:recipient.id,docId:item.id,subject:item.subject,docNumber:item.docNumber||"",targetMenu:item.type==="คำสั่งโรงเรียน"?"orders":item.type==="หนังสือเข้า"?"incoming":"circulars",createdAt:Date.now(),senderId:currentUser.id});
              batch.set(doc(getCollectionRef(AUDIT_LOG_PATH)),auditPayload(currentUser,"ส่งแจ้งเตือนซ้ำ","DOCUMENT",item.id,`ผู้รับ: ${recipient.name}`));
              await batch.commit();showToast(`ส่งแจ้งเตือนถึง ${recipient.name} แล้ว`,"success");
            }catch(e){showToast(e.message,"error");}
          }}/>}
          {activeMenu === "export_register" && <ExportRegisters documents={activeDocs} orderReservations={orderReservations} outgoingReservations={outgoingReservations} currentUser={currentUser} dbUsers={dbUsers} showToast={showToast}/>}
          {activeMenu==="document_detail" && <DocumentDetail doc={openedDoc} allDocs={activeDocs} currentUser={currentUser} dbUsers={dbUsers} systemSettings={systemSettings} onAcknowledge={ackDocument} onAcknowledgeAssignment={ackAssignment} onOpenRouting={()=>{setFocusDocId(openedDoc?.id||null);setActiveMenu("routing");}} onBack={id=>id?openDocument(id):setActiveMenu("dashboard")}/>}
          {activeMenu==="routing" && <RoutingWorkspace focusDocId={focusDocId} documents={activeDocs} currentUser={currentUser} dbUsers={dbUsers} systemSettings={systemSettings} onRoute={routeDocument} onHeadAction={headAction} onOpen={openDocument}/>}
          {activeMenu==="assignments" && <section className="bhs-modern-panel p-5 space-y-3"><h2 className="text-xl font-bold">งานที่ได้รับมอบหมาย</h2>{activeDocs.filter(d=>pendingAssignmentEvents(d,currentUser).length).map(d=><button key={d.id} onClick={()=>openDocument(d.id)} className="w-full text-left border p-4 rounded-xl hover:bg-blue-50 text-sm"><b>{d.subject}</b><div className="text-xs text-blue-700 mt-1">รอรับทราบงาน {pendingAssignmentEvents(d,currentUser).length} รายการ · เปิดหนังสือและข้อเกษียณ</div></button>)}{assignmentCount===0&&<p className="text-slate-500 text-sm">ไม่มีงานมอบหมายที่ยังไม่รับทราบ</p>}</section>}
          {activeMenu === "tasks" && <TasksView documents={activeDocs} currentUser={currentUser} dbUsers={dbUsers} systemSettings={systemSettings} showToast={showToast} />}
          {activeMenu === "incoming" && <IncomingView documents={activeDocs} currentUser={currentUser} dbUsers={dbUsers} systemSettings={systemSettings} changeMenu={setActiveMenu} showToast={showToast} />}
          {activeMenu === "orders" && <OrdersView documents={activeDocs} currentUser={currentUser} dbUsers={dbUsers} systemSettings={systemSettings} changeMenu={setActiveMenu} showToast={showToast} />}
          {activeMenu === "order_reservations" && <OrderReservationsView reservations={orderReservations} documents={documents} currentUser={currentUser} systemSettings={systemSettings} showToast={showToast} />}
          {activeMenu === "outgoing_reservations" && <OutgoingReservationsView reservations={outgoingReservations} currentUser={currentUser} systemSettings={systemSettings} showToast={showToast} />}
          {activeMenu === "circulars" && <CircularsView documents={activeDocs} currentUser={currentUser} dbUsers={dbUsers} systemSettings={systemSettings} changeMenu={setActiveMenu} showToast={showToast} />}
          {activeMenu === "mydocs" && <MyDocsView documents={activeDocs} currentUser={currentUser} dbUsers={dbUsers} systemSettings={systemSettings} showToast={showToast} />}
          {activeMenu === "users" && <UserManagementView dbUsers={dbUsers} documents={documents} systemSettings={systemSettings} showToast={showToast} currentUser={currentUser} />}
          {activeMenu === "settings" && <SystemSettingsView systemSettings={systemSettings} showToast={showToast} currentUser={currentUser} dbUsers={dbUsers} />}
          {activeMenu === "audit" && <AuditLogView currentUser={currentUser} showToast={showToast} />}
          {activeMenu === "trash" && <TrashView documents={documents} currentUser={currentUser} dbUsers={dbUsers} showToast={showToast} />}

          {activeMenu === "form_incoming" && <FormDocument docType="หนังสือเข้า" documents={activeDocs} changeMenu={setActiveMenu} backMenu="incoming" currentUser={currentUser} systemSettings={systemSettings} showToast={showToast} />}
          {activeMenu === "form_orders" && <FormDocument docType="คำสั่งโรงเรียน" documents={activeDocs} changeMenu={setActiveMenu} backMenu="orders" currentUser={currentUser} systemSettings={systemSettings} showToast={showToast} orderReservations={orderReservations} />}
          {activeMenu === "form_circular" && <FormDocument docType="หนังสือเวียนแจ้งรับทราบ" documents={activeDocs} changeMenu={setActiveMenu} backMenu="circulars" currentUser={currentUser} systemSettings={systemSettings} showToast={showToast} />}
        </main>
      </div>

      {changePasswordModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[95%] sm:max-w-sm overflow-hidden animate-fade-in">
             <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-gray-800 flex items-center"><KeyRound size={18} className="mr-2"/> เปลี่ยนรหัสผ่าน</h3>
                <button onClick={() => setChangePasswordModal(false)} className="text-gray-400 hover:text-red-500"><X size={20}/></button>
             </div>
             <form onSubmit={async (e) => {
               e.preventDefault();
               const np = e.target.np.value; const cp = e.target.cp.value;
               if(np !== cp) return showToast("รหัสผ่านไม่ตรงกัน", "error");
               if(np.length < 6) return showToast("รหัสผ่านต้องมี 6 ตัวอักษรขึ้นไป", "error");
               try {
                 await updateDoc(getDocumentRef(USERS_PATH, currentUser.id), { password: np });
                 writeAuditLog(currentUser, "เปลี่ยนรหัสผ่าน", "AUTH", currentUser.id, "ผู้ใช้เปลี่ยนรหัสผ่านของตนเอง");
                 showToast("เปลี่ยนรหัสผ่านสำเร็จ!", "success");
                 setChangePasswordModal(false);
               } catch(err) { showToast(err.message, "error"); }
             }} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold mb-1">รหัสผ่านใหม่</label>
                  <input name="np" type="password" required className="w-full border p-2 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">ยืนยันรหัสผ่านใหม่</label>
                  <input name="cp" type="password" required className="w-full border p-2 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button type="submit" className="w-full bg-[#003366] text-white py-2 rounded font-bold shadow-md hover:bg-blue-900 text-sm">อัปเดตรหัสผ่าน</button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}

function OutgoingReservationsView({ reservations, currentUser, systemSettings, showToast }) {
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [filterYear, setFilterYear] = useState("");
  const [savedNumber, setSavedNumber] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [docToDelete, setDocToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadingDocId, setUploadingDocId] = useState(null);

  let defaultDept = "";
  if (currentUser.adminDept && currentUser.adminDept !== "-") defaultDept = currentUser.adminDept;
  else if (currentUser.subjectArea && currentUser.subjectArea !== "-" && currentUser.subjectArea !== "ไม่มีกลุ่มสาระการเรียนรู้") defaultDept = currentUser.subjectArea;

  const [form, setForm] = useState({ 
    id: null,
    docNumber: "", 
    subject: "", 
    docDate: getTodayIso(), 
    responsibleDept: defaultDept,
    remark: "" 
  });

  const canAdd = ["admin", "clerk", "teacher"].includes(currentUser.role);
  
  const filteredReservations = reservations.filter(res => {
    if (filterYear && getNumberYear(res.docNumber) !== Number(filterYear)) return false;
    if (res.status === "canceled") return false;
    const searchLower = searchTerm.toLowerCase();
    return (
      (res.docNumber && res.docNumber.toLowerCase().includes(searchLower)) ||
      (res.subject && res.subject.toLowerCase().includes(searchLower))
    );
  });
  
  const displayedReservations = filteredReservations.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [searchTerm, filterYear, pageSize]);

  // Numbers are allocated during the Firestore transaction, not when the form opens.

  const openAddModal = () => {
    setForm({
      id: null,
      docNumber: "",
      subject: "",
      docDate: getTodayIso(),
      responsibleDept: defaultDept,
      remark: ""
    });
    setShowModal(true);
  };

  const openEditModal = (res) => {
    setForm({
      id: res.id,
      docNumber: res.docNumber,
      subject: res.subject,
      docDate: res.docDate,
      responsibleDept: res.responsibleDept || defaultDept,
      remark: res.remark || ""
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.subject || !form.docDate || !form.responsibleDept) {
       return showToast("กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน", "error");
    }
    
    setIsSubmitting(true);
    try {
      const payload = {
        docNumber: form.docNumber,
        subject: form.subject,
        docDate: form.docDate,
        responsibleDept: form.responsibleDept,
        remark: form.remark
      };

      if (form.id) {
        const original = reservations.find(r => r.id === form.id);
        if (original?.status === "canceled") throw new Error("ต้องใช้เมนูคืนเลขที่ยกเลิกสำหรับรายการนี้");
        await updateDoc(getDocumentRef(OUTGOING_RESERVE_PATH, form.id), {
          subject: payload.subject, responsibleDept: payload.responsibleDept,
          remark: payload.remark, updatedAt: Date.now(), updatedBy: currentUser.id
        });
        writeAuditLog(currentUser, "แก้ไขรายการจองเลข", "OUT", form.id, payload.subject);
        showToast("แก้ไขข้อมูลสำเร็จ", "success");
      } else {
        const number = await reserveSequentialNumber({
          kind: "OUT", collectionName: OUTGOING_RESERVE_PATH, numberField: "docNumber",
          dateField: "docDate", dateValue: form.docDate,
          data: { subject: form.subject, responsibleDept: form.responsibleDept, remark: form.remark }, user: currentUser
        });
        setSavedNumber(number);
      }
      setShowModal(false);
    } catch (err) {
      showToast("บันทึกไม่สำเร็จ: " + err.message, "error");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!docToDelete) return;
    try {
      const ref = getDocumentRef(OUTGOING_RESERVE_PATH, docToDelete);
      await runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("ไม่พบรายการจอง");
        if (snap.data().linkedDocumentId) throw new Error("รายการนี้เชื่อมกับคำสั่งแล้ว ไม่สามารถยกเลิกได้");
        tx.update(ref, {status: "canceled", canceledBy: currentUser.id, canceledAt: Date.now(),
          history: arrayUnion({action: "ยกเลิกเลขจอง", by: currentUser.id, time: Date.now(), subject: snap.data().subject})});
        tx.set(doc(getCollectionRef(AUDIT_LOG_PATH)), auditPayload(currentUser,"ยกเลิกเลขจอง","OUT",docToDelete,snap.data()["docNumber"]));
      });
      showToast("ยกเลิกแล้ว ระบบจะข้ามเลขนี้ ไม่แจกซ้ำ", "success");
    } catch(err) { showToast("ยกเลิกไม่สำเร็จ: " + err.message, "error"); }
    setDocToDelete(null);
  };

  const handleUploadFile = async (resId, e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.includes("script.google.com/macros/s/AKfycbwY4")) {
      return showToast("กรุณาตั้งค่า GAS_WEB_APP_URL ให้ถูกต้องก่อนใช้งาน", "error");
    }

    setUploadingDocId(resId);
    try {
      showToast(`กำลังอัปโหลด ${files.length} ไฟล์...`, "info");
      const uploadedFiles = await uploadMultipleFilesToDrive(files);
      
      const currentRes = reservations.find(r => r.id === resId);
      const existingFiles = currentRes.attachedFiles || (currentRes.attachedFile ? [currentRes.attachedFile] : []);
      const newFilesArray = [...existingFiles, ...uploadedFiles];

      await updateDoc(getDocumentRef(OUTGOING_RESERVE_PATH, resId), {
        attachedFiles: newFilesArray,
        updatedAt: Date.now(),
        updatedBy: currentUser.id
      });
      writeAuditLog(currentUser, "อัปโหลดไฟล์หนังสือออก", "OUTGOING_RESERVATION", resId, `อัปโหลด ${files.length} ไฟล์`);
      showToast("อัปโหลดไฟล์สำเร็จ", "success");
    } catch (err) {
      showToast("อัปโหลดไฟล์ไม่สำเร็จ: " + err.message, "error");
    }
    setUploadingDocId(null);
    e.target.value = null;
  };

  return (
    <div className="space-y-4">
      <SuccessNumberDialog number={savedNumber} label="ขอเลขหนังสือออกสำเร็จ" onClose={()=>setSavedNumber("")} />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-lg md:text-xl font-bold text-gray-800">ขอเลขที่หนังสือออก</h2>
        {canAdd && (
          <button onClick={openAddModal} className="w-full sm:w-auto bg-[#003366] text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center hover:bg-blue-900 transition-colors">
            <Plus size={16} className="mr-2" /> ขอเลขที่หนังสือออก
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden w-full flex flex-col">
        <div className="p-3 md:p-4 border-b bg-gray-50 flex flex-col sm:flex-row justify-between items-center shrink-0 gap-3">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="ค้นหาเลขที่หนังสือ หรือ รายการ (เรื่อง)..." 
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between sm:justify-end text-sm text-gray-700 font-bold w-full sm:w-auto gap-3">
            <select className="border rounded p-1 text-xs" value={filterYear} onChange={e=>setFilterYear(e.target.value)}>
              <option value="">ทุกปี</option>
              {[...new Set(reservations.map(r => getNumberYear(r.docNumber)).filter(Boolean))].sort((a,b)=>b-a).map(y=><option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-xs text-gray-500 font-medium">พบ {filteredReservations.length} รายการ</span>
            <div>
              แสดง:
              <select 
                className="ml-2 border border-gray-300 rounded p-1 outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={20}>20</option>
                <option value={40}>40</option>
                <option value={60}>60</option>
              </select>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto custom-scrollbar w-full pb-1">
          <table className="bhs-reservation-table min-w-[1000px] w-full text-left text-sm text-gray-600">
            <thead className="bg-blue-50 text-[#003366] text-xs uppercase font-bold border-b border-gray-200">
              <tr>
                <th className="px-5 py-3.5 w-24">เลขที่</th>
                <th className="px-5 py-3.5">รายการ (เรื่อง)</th>
                <th className="px-5 py-3.5 w-32">วันที่ออกหนังสือ</th>
                <th className="px-5 py-3.5 w-40">ผู้รับผิดชอบ</th>
                <th className="px-5 py-3.5 w-48">กลุ่มงาน/กลุ่มสาระฯ</th>
                <th className="px-5 py-3.5 min-w-[200px]">หมายเหตุ</th>
                <th className="px-5 py-3.5 min-w-[140px] text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {displayedReservations.map((res) => {
                const hasFiles = res.attachedFiles?.length > 0 || res.attachedFile;
                return (
                <tr key={res.id} className="hover:bg-blue-50/50 transition-colors odd:bg-white even:bg-gray-50/30">
                  <td className="px-5 py-3.5 font-bold text-gray-900 whitespace-nowrap">{res.docNumber}</td>
                  <td className="px-5 py-3.5 text-gray-800 break-words whitespace-normal min-w-[250px]">{res.subject}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">{formatThaiDate(res.docDate)}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">{res.responsibleName}</td>
                  <td className="px-5 py-3.5 text-[11px] md:text-xs">
                    <span className="bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-md text-gray-700 block truncate max-w-[180px]" title={res.responsibleDept}>
                      {res.responsibleDept}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 break-words whitespace-normal min-w-[200px]">
                    {res.remark && <div className="mb-1">{res.remark}</div>}
                    {hasFiles ? (
                      <span className="inline-flex items-center text-[10px] md:text-[11px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100 mt-0.5">
                        <CheckCircle size={12} className="mr-1" /> อัปโหลดหนังสือออกเรียบร้อยแล้ว
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[10px] md:text-[11px] font-bold text-red-500 bg-red-50 px-2 py-1 rounded border border-red-100 mt-0.5">
                        <AlertCircle size={12} className="mr-1" /> ยังไม่ได้อัปโหลดไฟล์
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap max-w-[160px] mx-auto">
                      
                      {res.attachedFiles && res.attachedFiles.map((f, i) => (
                        <a key={i} href={f.url} target="_blank" rel="noreferrer" onClick={() => writeAuditLog(currentUser, "ดาวน์โหลดไฟล์หนังสือออก", "FILE", res.id, `เปิดไฟล์: ${f.name}`)} className="text-green-600 hover:bg-green-100 p-1.5 rounded transition-colors" title={`ดาวน์โหลดไฟล์: ${f.name}`}>
                          <Download size={16} />
                        </a>
                      ))}
                      {!res.attachedFiles && res.attachedFile && (
                        <a href={res.attachedFile.url} target="_blank" rel="noreferrer" onClick={() => writeAuditLog(currentUser, "ดาวน์โหลดไฟล์หนังสือออก", "FILE", res.id, `เปิดไฟล์: ${res.attachedFile.name}`)} className="text-green-600 hover:bg-green-100 p-1.5 rounded transition-colors" title="ดาวน์โหลดไฟล์หนังสือออก">
                          <Download size={16} />
                        </a>
                      )}

                      {(currentUser.role === "admin" || currentUser.id === res.createdBy) && (
                         <>
                           <label className={`cursor-pointer text-indigo-600 hover:bg-indigo-100 p-1.5 rounded transition-colors ${uploadingDocId === res.id ? 'opacity-50 pointer-events-none' : ''}`} title="อัปโหลด/เพิ่มไฟล์หนังสือออก">
                             {uploadingDocId === res.id ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
                             <input type="file" className="hidden" multiple onChange={(e) => handleUploadFile(res.id, e)} accept=".pdf,image/*" disabled={uploadingDocId === res.id} />
                           </label>
                           <button onClick={() => openEditModal(res)} className="text-blue-500 hover:bg-blue-100 p-1.5 rounded transition-colors" title="แก้ไขรายการ">
                             <Edit size={16} />
                           </button>
                           <button onClick={() => setDocToDelete(res.id)} className="text-red-500 hover:bg-red-100 p-1.5 rounded transition-colors" title="ลบรายการ">
                             <Trash2 size={16} />
                           </button>
                         </>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
              {displayedReservations.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-10 text-gray-500 font-medium">ยังไม่มีการขอเลขที่หนังสือออก</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PageNavigator page={page} setPage={setPage} total={filteredReservations.length} pageSize={pageSize}/>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[95%] sm:max-w-lg overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            <div className="p-3 sm:p-5 border-b bg-[#003366] text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold text-base sm:text-lg flex items-center">
                <FileUp size={18} className="mr-2"/> 
                {form.id ? "แก้ไขข้อมูลขอเลขที่หนังสือออก" : "แบบฟอร์มขอเลขที่หนังสือออก"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-blue-200 hover:text-white transition-colors p-1"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                <div>
                  <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">เลขที่ <span className="text-red-500">*</span></label>
                  <input type="text" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-blue-700 bg-blue-50" value={form.id ? form.docNumber : "ระบบออกเลขให้เมื่อบันทึกสำเร็จ"} readOnly placeholder="เลขอัตโนมัติ" />
                  {!form.id && <p className="text-[10px] text-gray-500 mt-1">เลขจริงจะปรากฏหลังบันทึกสำเร็จ</p>}
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">รายการ (เรื่อง) <span className="text-red-500">*</span></label>
                  <input type="text" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">วันที่ออกหนังสือ <span className="text-red-500">*</span></label>
                  <input type="date" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={form.docDate} disabled={Boolean(form.id)} onChange={(e) => setForm({ ...form, docDate: e.target.value })} required />
                </div>
                
                <div className="grid grid-cols-1 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">ผู้รับผิดชอบ</label>
                    <p className="text-sm font-bold text-gray-800 bg-white border px-3 py-2.5 rounded shadow-sm">
                      {form.id ? reservations.find(r => r.id === form.id)?.responsibleName : currentUser.name}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">กลุ่มงาน/กลุ่มสาระฯ เจ้าของเรื่อง <span className="text-red-500">*</span></label>
                    <select 
                      className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white" 
                      value={form.responsibleDept} 
                      onChange={(e) => setForm({ ...form, responsibleDept: e.target.value })} 
                      required
                    >
                      <option value="">-- ระบุกลุ่มงาน/กลุ่มสาระฯ --</option>
                      {systemSettings?.adminDepts && (
                        <optgroup label="กลุ่มบริหารงาน">
                          {systemSettings.adminDepts.map((d) => <option key={d} value={d}>{d}</option>)}
                        </optgroup>
                      )}
                      {systemSettings?.subjectAreas && (
                        <optgroup label="กลุ่มสาระการเรียนรู้">
                          {systemSettings.subjectAreas.filter(d => d !== "ไม่มีกลุ่มสาระการเรียนรู้").map((d) => <option key={d} value={d}>{d}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">หมายเหตุ</label>
                  <input type="text" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" />
                </div>
              </div>
              
              <div className="p-3 sm:p-5 border-t flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 bg-gray-50 shrink-0">
                <button type="button" onClick={() => setShowModal(false)} disabled={isSubmitting} className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 border border-gray-300 text-gray-700 bg-white rounded-lg font-bold hover:bg-gray-100 transition-colors text-sm">ยกเลิก</button>
                <button type="submit" disabled={isSubmitting} className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 bg-[#003366] hover:bg-blue-900 text-white rounded-lg font-bold shadow-md flex items-center justify-center transition-colors text-sm">
                  {isSubmitting ? <Loader2 className="animate-spin mr-2" size={16} /> : <Save size={16} className="mr-2" />} {form.id ? "บันทึกการแก้ไข" : "บันทึกการขอเลขที่"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {docToDelete && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
           <div className="bg-white p-5 sm:p-6 rounded-xl shadow-xl w-full max-w-[95%] sm:max-w-sm text-center animate-fade-in">
             <AlertCircle size={40} className="mx-auto text-red-500 mb-3 sm:mb-4 sm:w-12 sm:h-12" />
             <h3 className="text-base sm:text-lg font-bold mb-2">ยกเลิกการขอเลขหนังสือออก?</h3>
             <p className="text-xs sm:text-sm text-gray-500 mb-5 sm:mb-6">ยกเลิกแล้วเลขนี้จะไม่ถูกแจกซ้ำโดยอัตโนมัติ</p>
             <div className="flex gap-2 sm:gap-3">
               <button onClick={() => setDocToDelete(null)} className="flex-1 px-3 sm:px-4 py-2 bg-gray-100 text-xs sm:text-sm font-bold rounded hover:bg-gray-200 transition-colors">ยกเลิก</button>
               <button onClick={handleDelete} className="flex-1 px-3 sm:px-4 py-2 bg-red-600 text-white text-xs sm:text-sm font-bold rounded hover:bg-red-700 transition-colors">ยืนยันการยกเลิก</button>
             </div>
           </div>
         </div>
      )}
    </div>
  );
}

function OrderReservationsView({ reservations, documents=[], currentUser, systemSettings, showToast }) {
  const [pageSize, setPageSize] = useState(20);
  const [showCanceled, setShowCanceled] = useState(false);
  const [page, setPage] = useState(1);
  const [filterYear, setFilterYear] = useState("");
  const [savedNumber, setSavedNumber] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [docToDelete, setDocToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showTrialArchived,setShowTrialArchived]=useState(false);
  const [selectedTrialIds,setSelectedTrialIds]=useState([]);
  const [bulkBusy,setBulkBusy]=useState(false);
  const [bulkProgress,setBulkProgress]=useState("");
  const [permanentTarget,setPermanentTarget]=useState(null);
  const [selectedPermanentIds,setSelectedPermanentIds]=useState([]);
  const [permanentBusy,setPermanentBusy]=useState(false);
  const [permanentProgress,setPermanentProgress]=useState("");
  const documentsById=new Map(documents.map(d=>[d.id,d]));
  const archiveReason=res=>canArchiveTrialOrder(res,res.linkedDocumentId?documentsById.get(res.linkedDocumentId):null);
  useEffect(()=>{setSelectedTrialIds([]);setSelectedPermanentIds([]);},[filterYear,searchTerm,showCanceled,showTrialArchived,page,pageSize]);

  let defaultDept = "";
  if (currentUser.adminDept && currentUser.adminDept !== "-") defaultDept = currentUser.adminDept;
  else if (currentUser.subjectArea && currentUser.subjectArea !== "-" && currentUser.subjectArea !== "ไม่มีกลุ่มสาระการเรียนรู้") defaultDept = currentUser.subjectArea;

  const [form, setForm] = useState({ 
    id: null,
    orderNumber: "", 
    subject: "", 
    orderDate: getTodayIso(), 
    responsibleDept: defaultDept,
    remark: "" 
  });

  const canAdd = ["admin", "clerk", "teacher"].includes(currentUser.role);
  
  const filteredReservations = reservations.filter(res => {
    if (filterYear && getNumberYear(res.orderNumber) !== Number(filterYear)) return false;
    if (res.status === "canceled" || res.trialArchived) return false;
    const searchLower = searchTerm.toLowerCase();
    return (
      (res.orderNumber && res.orderNumber.toLowerCase().includes(searchLower)) ||
      (res.subject && res.subject.toLowerCase().includes(searchLower))
    );
  });
  
  const canceledRows = reservations.filter(r => r.status === "canceled" && (!filterYear || getNumberYear(r.orderNumber) === Number(filterYear)));
  const archivedRows=reservations.filter(r=>r.trialArchived &&
    (!filterYear||getNumberYear(r.orderNumber)===Number(filterYear)) &&
    (String(r.orderNumber||"").toLowerCase().includes(searchTerm.toLowerCase()) ||
     String(r.subject||"").toLowerCase().includes(searchTerm.toLowerCase())));
  const viewRows=showTrialArchived&&currentUser.role==="admin"?archivedRows:
    showCanceled&&currentUser.role==="admin"?canceledRows:filteredReservations;
  const displayedReservations=viewRows.slice((page-1)*pageSize,page*pageSize);
  const canSelectTrial=currentUser.role==="admin"&&!showCanceled&&!showTrialArchived;
  const selectableRows=displayedReservations.filter(r=>!archiveReason(r));
  const canSelectPermanent=currentUser.role==="admin";
  useEffect(() => setPage(1), [searchTerm, filterYear, pageSize]);

  // Numbers are allocated during the Firestore transaction, not when the form opens.

  const openAddModal = () => {
    setForm({
      id: null,
      orderNumber: "",
      subject: "",
      orderDate: getTodayIso(),
      responsibleDept: defaultDept,
      remark: ""
    });
    setShowModal(true);
  };

  const openEditModal = (res) => {
    setForm({
      id: res.id,
      orderNumber: res.orderNumber,
      subject: res.subject,
      orderDate: res.orderDate,
      responsibleDept: res.responsibleDept || defaultDept,
      remark: res.remark || ""
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.subject || !form.orderDate || !form.responsibleDept) {
       return showToast("กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน", "error");
    }
    
    setIsSubmitting(true);
    try {
      const payload = {
        orderNumber: form.orderNumber,
        subject: form.subject,
        orderDate: form.orderDate,
        responsibleDept: form.responsibleDept,
        remark: form.remark
      };

      if (form.id) {
        const original=reservations.find(r=>r.id===form.id);
        if(!original)throw new Error("ไม่พบเลขคำสั่งที่กำลังแก้ไข");
        if(currentUser.role!=="admin"){
          if(original.status==="canceled"||original.trialArchived)throw new Error("เลขนี้ไม่พร้อมแก้ไข");
          if(original.linkedDocumentId)throw new Error("เลขนี้เชื่อมกับเอกสารแล้ว โปรดติดต่อแอดมิน");
          await updateDoc(getDocumentRef(ORDER_RESERVE_PATH,form.id),{
            subject:payload.subject,responsibleDept:payload.responsibleDept,
            remark:payload.remark,updatedAt:Date.now(),updatedBy:currentUser.id
          });
          writeAuditLog(currentUser,"แก้ไขรายการจองเลข","ORDER",form.id,payload.subject);
        }else{
          const parsed=parseRegisterNumber(form.orderNumber);
          if(!parsed)throw new Error("เลขคำสั่งต้องเป็นรูปแบบ เช่น 1/2569 (เลขบวกและปี พ.ศ.)");
          const oldNum=parseRegisterNumber(original.orderNumber);
          if(!oldNum)throw new Error("เลขคำสั่งเดิมมีรูปแบบไม่ถูกต้อง กรุณาตรวจสอบก่อน");
          const changed=parsed.text!==original.orderNumber;
          const existingDoc=original.linkedDocumentId?documentsById.get(original.linkedDocumentId):null;
          if(original.linkedDocumentId&&(!existingDoc||existingDoc.id!==original.linkedDocumentId||existingDoc.reservationId!==original.id||existingDoc.type!=="คำสั่งโรงเรียน"))throw new Error("เอกสารคู่ที่เชื่อมไม่ถูกต้อง");
          if(changed&&existingDoc?.signedFiles?.length){
            if(!window.confirm("คำสั่งนี้มี PDF ที่ ผอ. ลงนามแล้ว\\nการแก้เลขจะเปลี่ยนเฉพาะข้อมูลทะเบียนและรายละเอียดเอกสาร PDF ที่ลงนามจะยังมีเลขเดิม\\nยืนยันแก้เลขหรือไม่?")){setIsSubmitting(false);return;}
          }else if(changed&&existingDoc && ["อนุมัติ/สั่งการแล้ว","เผยแพร่แล้ว"].includes(existingDoc.status)){
            if(!window.confirm("เอกสารนี้อนุมัติหรือเผยแพร่แล้ว การแก้เลขไม่แก้ข้อความใน PDF ที่ออกไปแล้ว ยืนยันหรือไม่?")){setIsSubmitting(false);return;}
          }
          const counterYears=[...new Set([oldNum.year,parsed.year])];
          const [rows,docs,...counters]=await Promise.all([
            getDocsFromServer(getCollectionRef(ORDER_RESERVE_PATH)),
            getDocsFromServer(getCollectionRef(DOCS_PATH)),
            ...counterYears.map(year=>getDocFromServer(getDocumentRef(COUNTERS_PATH,`ORDER-${year}`)))
          ]);
          const rowsData=rows.docs.map(x=>({id:x.id,...x.data()}));
          const docsData=docs.docs.map(x=>({id:x.id,...x.data()}));
          const used=occupiedRegisterNumbers("ORDER",rowsData,docsData,original.id);
          if(changed&&used.has(parsed.text)&&original.status!=="canceled"&&!original.trialArchived)
            throw new Error("เลขนี้มีอยู่ในรายการใช้งานแล้ว กรุณาเลือกเลขอื่น");
          const ref=getDocumentRef(ORDER_RESERVE_PATH,form.id);
          await runTransaction(db,async tx=>{
            const fresh=await tx.get(ref);
            if(!fresh.exists())throw new Error("รายการถูกลบไปแล้ว");
            const live={id:fresh.id,...fresh.data()};
            if(live.orderNumber!==original.orderNumber||live.linkedDocumentId!==original.linkedDocumentId||
                live.status!==original.status||Boolean(live.trialArchived)!==Boolean(original.trialArchived))
              throw new Error("รายการเปลี่ยนไปแล้ว กรุณาเปิดแก้ไขใหม่");
            const dRef=live.linkedDocumentId?getDocumentRef(DOCS_PATH,live.linkedDocumentId):null;
            const linkedSnap=dRef?await tx.get(dRef):null;
            const linkedDoc=linkedSnap?.exists()?{id:linkedSnap.id,...linkedSnap.data()}:null;
            if(live.linkedDocumentId&&(!linkedDoc||linkedDoc.reservationId!==live.id||linkedDoc.type!=="คำสั่งโรงเรียน"))throw new Error("เอกสารคู่ที่เชื่อมไม่ถูกต้อง");
            const liveCounters=[];
            for(let k=0;k<counterYears.length;k++){
              const yr=counterYears[k],countRef=getDocumentRef(COUNTERS_PATH,`ORDER-${yr}`);
              const liveCounter=await tx.get(countRef),before=counters[k];
              if(liveCounter.exists()!==before.exists()||
                 registerCounterStamp(liveCounter.exists()?liveCounter.data():null)!==
                 registerCounterStamp(before.exists()?before.data():null))
                throw new Error("มีผู้ใช้เลขหรือแก้เลขระหว่างบันทึก กรุณาลองใหม่");
              liveCounters.push({yr,countRef,liveCounter});
            }
            const now=Date.now();
            tx.update(ref,{orderNumber:parsed.text,subject:payload.subject,
              responsibleDept:payload.responsibleDept,remark:payload.remark,
              updatedAt:now,updatedBy:currentUser.id,
              history:arrayUnion({action:"แอดมินแก้ไขเลขคำสั่ง",by:currentUser.id,time:now,
                subject:payload.subject,from:original.orderNumber,to:parsed.text})});
            if(dRef)tx.update(dRef,{docNumber:parsed.text,subject:payload.subject,
              history:arrayUnion({action:"แอดมินแก้เลขทะเบียน",by:currentUser.id,timestamp:now,
                detail:`${original.orderNumber} → ${parsed.text} (ไฟล์ PDF เดิมไม่เปลี่ยน)`})});
            if(changed)for(const {yr,countRef,liveCounter} of liveCounters){
              tx.set(countRef,{kind:"ORDER",year:yr,
                lastNumber:liveCounter.exists()?Number(liveCounter.data().lastNumber)||0:0,
                revision:(Number(liveCounter.exists()?liveCounter.data().revision:0)||0)+1,
                updatedAt:now},{merge:true});
            }
            tx.set(doc(getCollectionRef(AUDIT_LOG_PATH)),auditPayload(currentUser,
              "แอดมินแก้ไขเลขคำสั่ง","ORDER",form.id,
              `${original.orderNumber} → ${parsed.text} / ${payload.subject} (PDF เดิมไม่เปลี่ยน)`));
          });
        }
        showToast("แก้ไขข้อมูลเลขคำสั่งสำเร็จ","success");
      } else {
        const number = await reserveSequentialNumber({
          kind: "ORDER", collectionName: ORDER_RESERVE_PATH, numberField: "orderNumber",
          dateField: "orderDate", dateValue: form.orderDate,
          data: { subject: form.subject, responsibleDept: form.responsibleDept, remark: form.remark }, user: currentUser
        });
        setSavedNumber(number);
      }
      setShowModal(false);
    } catch (err) {
      showToast("บันทึกไม่สำเร็จ: " + err.message, "error");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!docToDelete) return;
    try {
      const ref = getDocumentRef(ORDER_RESERVE_PATH, docToDelete);
      await runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("ไม่พบรายการจอง");
        if (snap.data().linkedDocumentId) throw new Error("รายการนี้เชื่อมกับคำสั่งแล้ว ไม่สามารถยกเลิกได้");
        tx.update(ref, {status: "canceled", canceledBy: currentUser.id, canceledAt: Date.now(),
          history: arrayUnion({action: "ยกเลิกเลขจอง", by: currentUser.id, time: Date.now(), subject: snap.data().subject})});
        tx.set(doc(getCollectionRef(AUDIT_LOG_PATH)), auditPayload(currentUser,"ยกเลิกเลขจอง","ORDER",docToDelete,snap.data()["orderNumber"]));
      });
      showToast("ยกเลิกแล้ว ระบบจะข้ามเลขนี้ ไม่แจกซ้ำ", "success");
    } catch(err) { showToast("ยกเลิกไม่สำเร็จ: " + err.message, "error"); }
    setDocToDelete(null);
  };

  // Admin-only hard removal of a reservation plus the linked record (any status).
  // Audit metadata remains for traceability; Drive uploads are external and are not deleted.
  const deleteOrderPermanently=async id=>{
    if(currentUser.role!=="admin")throw new Error("เฉพาะแอดมินเท่านั้น");
    const resRef=getDocumentRef(ORDER_RESERVE_PATH,id);
    const before=await getDocFromServer(resRef);
    if(!before.exists())throw new Error("ไม่พบเลขคำสั่ง");
    const entry={id,...before.data()},parsed=parseRegisterNumber(entry.orderNumber);
    if(!parsed)throw new Error("รูปแบบเลขคำสั่งไม่ถูกต้อง กรุณาตรวจสอบ");
    const counterRef=getDocumentRef(COUNTERS_PATH,`ORDER-${parsed.year}`);
    const [countBefore,reminderSnap]=await Promise.all([
      getDocFromServer(counterRef),getDocsFromServer(getCollectionRef(REMINDERS_PATH))
    ]);
    const reminders=entry.linkedDocumentId?reminderSnap.docs.filter(r=>r.data().docId===entry.linkedDocumentId):[];
    if(reminders.length>400)throw new Error("รายการแจ้งเตือนมากเกินขอบเขต ลบไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ");
    await runTransaction(db,async tx=>{
      const fresh=await tx.get(resRef);
      if(!fresh.exists())throw new Error("รายการถูกลบไปแล้ว");
      const live={id:fresh.id,...fresh.data()};
      if(live.orderNumber!==entry.orderNumber||live.linkedDocumentId!==entry.linkedDocumentId)
        throw new Error("ข้อมูลเปลี่ยนระหว่างลบ กรุณาลองใหม่");
      const linkedRef=live.linkedDocumentId?getDocumentRef(DOCS_PATH,live.linkedDocumentId):null;
      const dSnap=linkedRef?await tx.get(linkedRef):null;
      const linkedDoc=dSnap?.exists()?{id:dSnap.id,...dSnap.data()}:null;
      if(live.linkedDocumentId&&(!linkedDoc||linkedDoc.reservationId!==live.id||linkedDoc.type!=="คำสั่งโรงเรียน"))throw new Error("เอกสารคู่ที่เชื่อมไม่ถูกต้อง");
      const countLive=await tx.get(counterRef);
      if(countLive.exists()!==countBefore.exists()||
         registerCounterStamp(countLive.exists()?countLive.data():null)!==
         registerCounterStamp(countBefore.exists()?countBefore.data():null))
        throw new Error("มีรายการเปลี่ยนระหว่างลบ กรุณาดำเนินการอีกครั้ง");
      const now=Date.now();
      tx.delete(resRef);
      if(linkedRef)tx.delete(linkedRef);
      for(const reminder of reminders)tx.delete(reminder.ref);
      tx.set(counterRef,{kind:"ORDER",year:parsed.year,
        lastNumber:countLive.exists()?Number(countLive.data().lastNumber)||0:0,
        revision:(Number(countLive.exists()?countLive.data().revision:0)||0)+1,
        updatedAt:now},{merge:true});
      tx.set(doc(getCollectionRef(AUDIT_LOG_PATH)),auditPayload(currentUser,
        "แอดมินลบเลขคำสั่งและเอกสารถาวร","ORDER",id,
        `${entry.orderNumber}: ${entry.subject} / เอกสาร ${live.linkedDocumentId||"ไม่มี"} / PDF ใน Drive ไม่ถูกลบ`));
    });
  };
  const requestPermanentDelete=async res=>{
    if(currentUser.role!=="admin"||permanentBusy||bulkBusy)return;
    setPermanentTarget(res);
  };
  const runPermanentRemoval=async()=>{
    if(!permanentTarget||currentUser.role!=="admin"||permanentBusy)return;
    const phrase=window.prompt("พิมพ์คำว่า ลบถาวร เพื่อยืนยันลบเลข "+permanentTarget.orderNumber+" และเอกสารที่เชื่อมทั้งหมด (แม้ลงนามแล้ว)\\nไฟล์ PDF ใน Google Drive ยังไม่ได้ถูกลบอัตโนมัติ");
    if(phrase!=="ลบถาวร")return;
    if(!window.confirm("ยืนยันอีกครั้ง: ข้อมูลเลขคำสั่งและเอกสารที่เชื่อมจะถูกลบถาวรจาก Firestore ไม่สามารถกู้คืนจากถังขยะได้"))return;
    setPermanentBusy(true);
    try{await deleteOrderPermanently(permanentTarget.id);
      showToast("ลบเลขคำสั่งและเอกสารที่เชื่อมออกจากระบบแล้ว (ไฟล์ Drive ยังอยู่)","success");
      setPermanentTarget(null);
    }catch(e){showToast("ลบถาวรไม่สำเร็จ: "+String(e?.message||e),"error");}
    finally{setPermanentBusy(false);}
  };
  const removeSelectedPermanently=async()=>{
    if(currentUser.role!=="admin"||permanentBusy||!selectedPermanentIds.length)return;
    if(selectedPermanentIds.length>50)return showToast("เลือกลบได้ครั้งละไม่เกิน 50 รายการ","error");
    const phrase=window.prompt("คุณเลือก "+selectedPermanentIds.length+" รายการ รวมคำสั่งที่ลงนามแล้วได้\\nพิมพ์ ลบถาวร เพื่อยืนยัน (ไฟล์ PDF บน Drive จะยังคงอยู่)");
    if(phrase!=="ลบถาวร")return;
    if(!window.confirm("ลบถาวร "+selectedPermanentIds.length+" รายการจาก Firestore และเอกสารที่เชื่อมทั้งหมด ใช่หรือไม่?"))return;
    const ids=[...selectedPermanentIds];
    setPermanentBusy(true);
    let done=0,fail=[];
    for(let k=0;k<ids.length;k++){
      setPermanentProgress("กำลังลบ "+(k+1)+"/"+ids.length);
      try{await deleteOrderPermanently(ids[k]);done++;}
      catch(err){fail.push({id:ids[k],message:String(err?.message||err)});}
    }
    setPermanentBusy(false);setPermanentProgress("");
    setSelectedPermanentIds(fail.map(x=>x.id));
    if(fail.length)showToast("ลบได้ "+done+" รายการ ล้มเหลว "+fail.length+" รายการ: "+fail[0].message,"error");
    else showToast("ลบถาวร "+done+" รายการจากฐานข้อมูลสำเร็จ (Drive เก็บไฟล์เดิมไว้)","success");
  };

  const restoreNumberPreflight=async id=>{
    const [reservationSnap,rows,docs]=await Promise.all([
      getDocFromServer(getDocumentRef(ORDER_RESERVE_PATH,id)),
      getDocsFromServer(getCollectionRef(ORDER_RESERVE_PATH)),
      getDocsFromServer(getCollectionRef(DOCS_PATH))
    ]);
    if(!reservationSnap.exists())throw new Error("ไม่พบเลขเดิมสำหรับกู้คืน");
    const data=reservationSnap.data(),number=parseRegisterNumber(data.orderNumber);
    if(!number)throw new Error("เลขเดิมมีรูปแบบไม่ถูกต้อง");
    const occupied=occupiedRegisterNumbers("ORDER",
      rows.docs.map(x=>({id:x.id,...x.data()})),docs.docs.map(x=>({id:x.id,...x.data()})),id);
    if(occupied.has(number.text))throw new Error("เลขนี้มีรายการใช้งานใหม่แล้ว ไม่สามารถกู้คืนจนกว่าจะแก้ไขเลข");
    const counterRef=getDocumentRef(COUNTERS_PATH,`ORDER-${number.year}`);
    const counterBefore=await getDocFromServer(counterRef);
    return {counterRef,counterBefore,number};
  };

  // Reservation, linked draft and audit log are updated atomically, per row.
  // No number counters are modified and no Drive files are deleted.
  const mutateTrialArchive=async(reservationId,restore=false)=>{
    if(currentUser.role!=="admin")throw new Error("เฉพาะแอดมินเท่านั้น");
    const resRef=getDocumentRef(ORDER_RESERVE_PATH,reservationId);
    const preflight=restore?await restoreNumberPreflight(reservationId):null;
    const auditRef=doc(getCollectionRef(AUDIT_LOG_PATH));
    await runTransaction(db,async tx=>{
      const resSnap=await tx.get(resRef);
      if(!resSnap.exists())throw new Error("ไม่พบรายการเลขคำสั่ง");
      const reservation={id:resSnap.id,...resSnap.data()};
      const linkedRef=reservation.linkedDocumentId?getDocumentRef(DOCS_PATH,reservation.linkedDocumentId):null;
      const linkedSnap=linkedRef?await tx.get(linkedRef):null;
      const linkedDoc=linkedSnap?.exists()?{id:linkedSnap.id,...linkedSnap.data()}:null;
      const rejection=restore?canRestoreTrialOrder(reservation,linkedDoc):canArchiveTrialOrder(reservation,linkedDoc);
      if(rejection)throw new Error(rejection);
      let liveCounter=null;
      if(preflight){
        liveCounter=await tx.get(preflight.counterRef);
        if(liveCounter.exists()!==preflight.counterBefore.exists()||
           registerCounterStamp(liveCounter.exists()?liveCounter.data():null)!==
           registerCounterStamp(preflight.counterBefore.exists()?preflight.counterBefore.data():null))
          throw new Error("มีคนจองเลขระหว่างกู้คืน กรุณาลองใหม่");
      }
      const now=Date.now(),action=restore?"กู้คืนรายการทดลอง":"จัดเก็บรายการทดลอง";
      tx.update(resRef,{
        trialArchived:!restore,
        trialArchivedAt:restore?null:now,trialArchivedBy:restore?null:currentUser.id,
        trialRestoredAt:restore?now:null,trialRestoredBy:restore?currentUser.id:null,
        history:arrayUnion({action,by:currentUser.id,time:now,subject:reservation.subject})
      });
      if(linkedRef)tx.update(linkedRef,{
        isDeleted:!restore,trialArchived:!restore,trialArchivedAt:restore?null:now,
        trialArchivedBy:restore?null:currentUser.id,
        deletedAt:restore?null:now,deletedBy:restore?null:currentUser.id,
        history:arrayUnion({action,by:currentUser.id,time:now,subject:reservation.subject})
      });
      if(preflight){
        tx.set(preflight.counterRef,{
          kind:"ORDER",year:preflight.number.year,
          lastNumber:liveCounter.exists()?Number(liveCounter.data().lastNumber)||0:0,
          revision:(Number(liveCounter.exists()?liveCounter.data().revision:0)||0)+1,
          updatedAt:now
        },{merge:true});
      }
      tx.set(auditRef,auditPayload(currentUser,action,"ORDER",reservation.id,
        reservation.orderNumber+" — "+reservation.subject+(linkedRef?" (พร้อมเอกสารที่เชื่อม)":" (เฉพาะเลขจอง)")));
    });
  };
  const archiveSelected=async()=>{
    if(currentUser.role!=="admin"||bulkBusy||!selectedTrialIds.length)return;
    if(selectedTrialIds.length>50)return showToast("เลือกจัดเก็บได้ครั้งละไม่เกิน 50 รายการ","error");
    const ids=[...selectedTrialIds];
    if(!window.confirm("ยืนยันจัดเก็บรายการทดลอง "+ids.length+" รายการ?\\nระบบซ่อนเลขจองและคำสั่งร่างที่เชื่อมกัน โดยไม่ลบ PDF ไม่ลบประวัติ และไม่คืนเลขไปใช้ซ้ำ"))return;
    setBulkBusy(true);setBulkProgress("กำลังตรวจสอบรายการ...");
    let completed=0;const failures=[];
    for(let k=0;k<ids.length;k++){
      setBulkProgress("กำลังจัดเก็บ "+(k+1)+"/"+ids.length);
      try{await mutateTrialArchive(ids[k]);completed++;}
      catch(error){failures.push({id:ids[k],message:String(error?.message||error)});}
    }
    setBulkBusy(false);setBulkProgress("");
    setSelectedTrialIds(failures.map(x=>x.id));
    if(failures.length)showToast("จัดเก็บสำเร็จ "+completed+" รายการ; ไม่สำเร็จ "+failures.length+" รายการ: "+failures[0].message,"error");
    else showToast("จัดเก็บรายการทดลอง "+completed+" รายการแล้ว สามารถกู้คืนได้","success");
  };
  const restoreTrial=async(res)=>{
    if(currentUser.role!=="admin"||bulkBusy)return;
    if(!window.confirm("กู้คืนเลข "+res.orderNumber+" และคำสั่งร่างที่เชื่อม (ถ้ามี) กลับไปยังรายการใช้งานใช่หรือไม่?"))return;
    setBulkBusy(true);
    try{await mutateTrialArchive(res.id,true);showToast("กู้คืนเลข "+res.orderNumber+" เรียบร้อย","success");}
    catch(error){showToast("กู้คืนไม่สำเร็จ: "+String(error?.message||error),"error");}
    finally{setBulkBusy(false);}
  };
  const [recoverItem, setRecoverItem] = useState(null);
  const [recoverSubject, setRecoverSubject] = useState("");
  const [recoverDept, setRecoverDept] = useState("");
  const recoverCanceled = async () => {
    if(!recoverItem||!recoverSubject.trim()||!recoverDept||currentUser.role!=="admin")return;
    try{
      const preflight=await restoreNumberPreflight(recoverItem.id);
      await runTransaction(db,async tx=>{
        const ref=getDocumentRef(ORDER_RESERVE_PATH,recoverItem.id);
        const snap=await tx.get(ref);
        if(!snap.exists()||snap.data().status!=="canceled"||snap.data().trialArchived||snap.data().linkedDocumentId)
          throw new Error("เลขนี้ไม่พร้อมใช้งาน");
        if(snap.data().orderNumber!==preflight.number.text)throw new Error("เลขถูกเปลี่ยนระหว่างกู้คืน");
        const liveCounter=await tx.get(preflight.counterRef);
        if(liveCounter.exists()!==preflight.counterBefore.exists()||
           registerCounterStamp(liveCounter.exists()?liveCounter.data():null)!==
           registerCounterStamp(preflight.counterBefore.exists()?preflight.counterBefore.data():null))
          throw new Error("มีคนจองเลขระหว่างกู้คืน กรุณาลองใหม่");
        const now=Date.now();
        tx.update(ref,{status:"reserved",subject:recoverSubject.trim(),responsibleDept:recoverDept,
          createdBy:currentUser.id,responsibleName:currentUser.name,
          restoredBy:currentUser.id,restoredAt:now,
          history:arrayUnion({action:"นำเลขกลับมาใช้ใหม่",by:currentUser.id,time:now,subject:recoverSubject.trim()})});
        tx.set(preflight.counterRef,{kind:"ORDER",year:preflight.number.year,
          lastNumber:liveCounter.exists()?Number(liveCounter.data().lastNumber)||0:0,
          revision:(Number(liveCounter.exists()?liveCounter.data().revision:0)||0)+1,
          updatedAt:now},{merge:true});
        tx.set(doc(getCollectionRef(AUDIT_LOG_PATH)),
          auditPayload(currentUser,"กู้เลขที่ยกเลิก","ORDER",recoverItem.id,`${snap.data().orderNumber}: ${recoverSubject}`));
      });
      setRecoverItem(null);setShowCanceled(false);showToast("นำเลขกลับมาใช้ใหม่เรียบร้อย","success");
    }catch(e){showToast(e.message,"error");}
  };
  return (
    <div className="space-y-4">
      <SuccessNumberDialog number={savedNumber} label="จองเลขคำสั่งสำเร็จ" onClose={()=>setSavedNumber("")} />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-lg md:text-xl font-bold text-gray-800">เลขคำสั่งโรงเรียน</h2>
        {currentUser.role==="admin"&&<div className="flex flex-wrap items-center gap-2">
          <button className="border rounded-lg px-3 py-2 text-sm" onClick={()=>{setShowTrialArchived(false);setShowCanceled(!showCanceled);setPage(1);}}>
            {showCanceled?"กลับรายการใช้งาน":"รายการที่ยกเลิก (แอดมิน)"}
          </button>
          <button className="border border-indigo-300 text-indigo-800 bg-indigo-50 rounded-lg px-3 py-2 text-sm font-bold" onClick={()=>{setShowCanceled(false);setShowTrialArchived(!showTrialArchived);setPage(1);}}>
            {showTrialArchived?"กลับรายการใช้งาน":"รายการทดลองที่จัดเก็บ ("+archivedRows.length+")"}
          </button>
        </div>}
        {currentUser.role !== "admin" && reservations.some(r=>r.createdBy===currentUser.id && r.status==="canceled") &&
          <details className="text-xs"><summary className="cursor-pointer underline">ประวัติเลขที่ฉันยกเลิก</summary>
            <div className="absolute z-20 bg-white shadow-lg border rounded p-3 max-h-52 overflow-auto">
              {reservations.filter(r=>r.createdBy===currentUser.id && r.status==="canceled").map(r=><p key={r.id}>{r.orderNumber} — {r.subject}</p>)}
            </div>
          </details>}
        {canAdd && (
          <button onClick={openAddModal} className="w-full sm:w-auto bg-[#003366] text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center hover:bg-blue-900 transition-colors">
            <Plus size={16} className="mr-2" /> จองเลขคำสั่งโรงเรียน
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden w-full flex flex-col">
        <div className="p-3 md:p-4 border-b bg-gray-50 flex flex-col sm:flex-row justify-between items-center shrink-0 gap-3">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="ค้นหาเลขที่คำสั่ง หรือ รายการ (เรื่อง)..." 
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between sm:justify-end text-sm text-gray-700 font-bold w-full sm:w-auto gap-3">
            <select className="border rounded p-1 text-xs" value={filterYear} onChange={e=>setFilterYear(e.target.value)}>
              <option value="">ทุกปี</option>
              {[...new Set(reservations.map(r => getNumberYear(r.orderNumber)).filter(Boolean))].sort((a,b)=>b-a).map(y=><option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-xs text-gray-500 font-medium">พบ {viewRows.length} รายการ</span>
            <div>
              แสดง:
              <select 
                className="ml-2 border border-gray-300 rounded p-1 outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={20}>20</option>
                <option value={40}>40</option>
                <option value={60}>60</option>
              </select>
            </div>
          </div>
        </div>
        
        {canSelectTrial&&<div className="px-4 py-3 border-b bg-indigo-50 flex items-center gap-3 flex-wrap text-sm">
          <label className="flex gap-2 items-center">
            <input type="checkbox" disabled={!selectableRows.length||bulkBusy}
              checked={selectableRows.length>0&&selectableRows.every(r=>selectedTrialIds.includes(r.id))}
              onChange={e=>setSelectedTrialIds(e.target.checked?selectableRows.map(r=>r.id):[])} />
            เลือกทั้งหมดในหน้านี้ (เฉพาะรายการที่จัดเก็บได้)
          </label>
          <span className="text-indigo-900">เลือก {selectedTrialIds.length} รายการ</span>
          <button disabled={!selectedTrialIds.length||bulkBusy} onClick={archiveSelected}
            className="rounded-lg bg-indigo-700 text-white font-bold px-3 py-2 disabled:opacity-40">
            {bulkBusy?"กำลังจัดเก็บ...":"จัดเก็บ/ซ่อนรายการทดลองที่เลือก"}
          </button>
          {bulkProgress&&<span className="text-indigo-800">{bulkProgress}</span>}
          <p className="w-full text-xs text-indigo-800">แอดมินจัดเก็บได้เฉพาะเลขจองว่างหรือคำสั่งร่างที่ยังไม่ลงนาม/เผยแพร่ เอกสารและประวัติยังอยู่ และเลขจะไม่ถูกนำมาใช้ซ้ำ</p>
        </div>}
        {canSelectPermanent&&<div className="px-4 py-3 border-b bg-red-50 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-red-900">
            <input type="checkbox" disabled={!displayedReservations.length||permanentBusy}
              checked={displayedReservations.length>0&&displayedReservations.every(r=>selectedPermanentIds.includes(r.id))}
              onChange={e=>setSelectedPermanentIds(e.target.checked?displayedReservations.map(r=>r.id):[])} />
            เลือกเพื่อลบถาวรทั้งหมดในหน้านี้
          </label>
          <span>เลือก {selectedPermanentIds.length} รายการ</span>
          <button type="button" disabled={!selectedPermanentIds.length||permanentBusy||bulkBusy}
            onClick={removeSelectedPermanently}
            className="px-3 py-2 rounded bg-red-700 text-white font-bold disabled:opacity-40">
            ลบถาวรรายการที่เลือก
          </button>
          {permanentProgress&&<span>{permanentProgress}</span>}
          <p className="w-full text-xs text-red-800">เฉพาะแอดมิน: ลบได้ทุกสถานะ รวมสร้างคำสั่งและ ผอ.ลงนามแล้ว ลบเลขและเอกสารที่เชื่อมจากฐานข้อมูล แต่ไฟล์ใน Google Drive ยังคงอยู่ ต้องยืนยันสองขั้นตอน</p>
        </div>}
        <div className="overflow-x-auto custom-scrollbar w-full pb-1">
          <table className="bhs-reservation-table min-w-[1000px] w-full text-left text-sm text-gray-600">
            <thead className="bg-blue-50 text-[#003366] text-xs uppercase font-bold border-b border-gray-200">
              <tr>
                {canSelectPermanent&&<th className="px-3 py-3.5 w-14 text-center">ลบถาวร</th>}
                {canSelectTrial&&<th className="px-3 py-3.5 w-14 text-center">เก็บทดลอง</th>}
                <th className="px-5 py-3.5 w-24">เลขที่</th>
                <th className="px-5 py-3.5">รายการ (เรื่อง)</th>
                <th className="px-5 py-3.5 w-32">วันที่ออกคำสั่ง</th>
                <th className="px-5 py-3.5 w-40">ผู้รับผิดชอบ</th>
                <th className="px-5 py-3.5 w-48">กลุ่มงาน/กลุ่มสาระฯ</th>
                <th className="px-5 py-3.5 w-40">หมายเหตุ</th>
                <th className="px-5 py-3.5 w-24 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {displayedReservations.map((res) => (
                <tr key={res.id} className="hover:bg-blue-50/50 transition-colors odd:bg-white even:bg-gray-50/30">
                  {canSelectPermanent&&<td className="px-3 py-3.5 text-center">
                    <input type="checkbox" disabled={permanentBusy} checked={selectedPermanentIds.includes(res.id)}
                      onChange={e=>setSelectedPermanentIds(ids=>e.target.checked?[...new Set([...ids,res.id])]:ids.filter(id=>id!==res.id))}/>
                  </td>}
                  {canSelectTrial&&<td className="px-3 py-3.5 text-center" title={archiveReason(res)||"เลือกเพื่อจัดเก็บ"}>
                    <input type="checkbox" disabled={!!archiveReason(res)||bulkBusy}
                      checked={selectedTrialIds.includes(res.id)}
                      onChange={e=>setSelectedTrialIds(ids=>e.target.checked?[...new Set([...ids,res.id])]:ids.filter(id=>id!==res.id))}/>
                  </td>}
                  <td className="px-5 py-3.5 font-bold text-gray-900 whitespace-nowrap">{res.orderNumber} {res.status === "canceled" && "(ยกเลิก)"} {res.trialArchived&&<span className="text-xs text-indigo-700">(จัดเก็บทดลอง)</span>} {res.linkedDocumentId && <span className="text-xs font-normal text-green-700">(สร้างคำสั่งแล้ว)</span>}</td>
                  <td className="px-5 py-3.5 text-gray-800 break-words whitespace-normal min-w-[250px]">{res.subject}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">{formatThaiDate(res.orderDate)}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">{res.responsibleName}</td>
                  <td className="px-5 py-3.5 text-[11px] md:text-xs">
                    <span className="bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-md text-gray-700 block truncate max-w-[180px]" title={res.responsibleDept}>
                      {res.responsibleDept}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 break-words whitespace-normal min-w-[150px]">{res.remark && <div className="mb-1">{res.remark}</div>}</td>
                  <td className="px-5 py-3.5 text-center whitespace-nowrap">
                    <div className="flex gap-2 justify-center items-center">
                      {currentUser.role==="admin"&&<button type="button" disabled={permanentBusy||bulkBusy}
                        onClick={()=>openEditModal(res)} className="text-blue-700 hover:bg-blue-100 rounded p-1" title="แก้ไขเลขคำสั่งได้ทุกสถานะ">
                        <Edit size={16}/>
                      </button>}
                      {showTrialArchived&&res.trialArchived&&currentUser.role==="admin"&&
                        <button type="button" disabled={permanentBusy||bulkBusy} onClick={()=>restoreTrial(res)}
                          className="text-indigo-700 text-xs underline">กู้คืน</button>}
                      {res.status==="canceled"&&!res.trialArchived&&currentUser.role==="admin"&&
                        <button type="button" onClick={()=>{setRecoverItem(res);setRecoverSubject("");setRecoverDept(res.responsibleDept||"");}}
                          className="text-blue-700 text-xs underline">นำเลขกลับมาใช้</button>}
                      {currentUser.role==="admin"&&<button type="button" disabled={permanentBusy||bulkBusy}
                        onClick={()=>requestPermanentDelete(res)} className="text-red-700 hover:bg-red-100 rounded p-1" title="ลบถาวรเลขและเอกสารที่เชื่อม">
                        <Trash2 size={16}/>
                      </button>}
                      {currentUser.role!=="admin"&&!res.trialArchived&&!res.linkedDocumentId&&res.status!=="canceled"&&currentUser.id===res.createdBy&&
                        <><button type="button" onClick={()=>openEditModal(res)} className="text-blue-500 hover:bg-blue-100 p-1.5 rounded" title="แก้ไขรายการ"><Edit size={16}/></button>
                          <button type="button" onClick={()=>setDocToDelete(res.id)} className="text-red-500 hover:bg-red-100 p-1.5 rounded" title="ยกเลิกเลขจอง"><Trash2 size={16}/></button></>}
                    </div>
                  </td>
                </tr>
              ))}
              {displayedReservations.length === 0 && (
                <tr>
                  <td colSpan={7+(canSelectTrial?1:0)+(canSelectPermanent?1:0)} className="text-center py-10 text-gray-500 font-medium">ยังไม่มีการจองเลขคำสั่ง</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PageNavigator page={page} setPage={setPage} total={viewRows.length} pageSize={pageSize}/>
      </div>

      {permanentTarget&&<div className="fixed inset-0 z-[130] bg-black/70 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-5 max-w-md w-full space-y-3">
          <h3 className="text-lg font-bold text-red-800">ลบถาวรเลขคำสั่ง {permanentTarget.orderNumber}?</h3>
          <p className="text-sm">เรื่อง: {permanentTarget.subject}</p>
          <p className="text-sm text-red-700">ลบรายการเลขคำสั่งและเอกสารที่เชื่อมจาก Firestore ทุกสถานะ รวมเอกสารที่ลงนามแล้ว ไม่สามารถกู้คืนจากถังขยะได้ แต่ไฟล์ PDF บน Google Drive ยังอยู่</p>
          <div className="flex gap-2">
            <button className="flex-1 border rounded px-3 py-2" disabled={permanentBusy} onClick={()=>setPermanentTarget(null)}>ยกเลิก</button>
            <button className="flex-1 bg-red-700 text-white font-bold rounded px-3 py-2 disabled:opacity-40" disabled={permanentBusy} onClick={runPermanentRemoval}>ยืนยันลบถาวร</button>
          </div>
        </div>
      </div>}
      {recoverItem && <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4"><div className="bg-white rounded-xl p-5 max-w-md w-full space-y-3">
        <h3 className="font-bold">นำเลข {recoverItem.orderNumber} กลับมาใช้ใหม่</h3>
        <p className="text-xs text-gray-500">เรื่องเดิม: {recoverItem.subject} (ยังเก็บไว้ในประวัติ)</p>
        <input className="w-full border p-2 rounded" placeholder="กรอกชื่อเรื่องใหม่" value={recoverSubject} onChange={e=>setRecoverSubject(e.target.value)}/>
        <label className="block text-xs">กลุ่มงานเจ้าของเรื่องใหม่</label>
        <select className="w-full border p-2 rounded" value={recoverDept} onChange={e=>setRecoverDept(e.target.value)}>
          <option value="">-- เลือกกลุ่มงาน --</option>
          {[...(systemSettings.adminDepts||[]),...(systemSettings.subjectAreas||[])].map(d=><option key={d} value={d}>{d}</option>)}
        </select>
        <p className="text-xs text-gray-500">รายการใหม่จะอยู่ในความรับผิดชอบของแอดมินผู้กู้เลข ประวัติเดิมยังคงอยู่</p>
        <div className="flex gap-2"><button className="flex-1 border rounded p-2" onClick={()=>setRecoverItem(null)}>ยกเลิก</button><button disabled={!recoverSubject.trim() || !recoverDept} className="flex-1 bg-blue-800 text-white rounded p-2 disabled:opacity-50" onClick={recoverCanceled}>ยืนยัน</button></div>
      </div></div>}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[95%] sm:max-w-lg overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            <div className="p-3 sm:p-5 border-b bg-[#003366] text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold text-base sm:text-lg flex items-center">
                <Hash size={18} className="mr-2"/> 
                {form.id ? "แก้ไขข้อมูลจองเลขคำสั่ง" : "แบบฟอร์มจองเลขคำสั่งโรงเรียน"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-blue-200 hover:text-white transition-colors p-1"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                <div>
                  <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">เลขที่ <span className="text-red-500">*</span></label>
                  <input type="text" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-blue-700 bg-blue-50"
            value={form.id ? form.orderNumber : "ระบบออกเลขให้เมื่อบันทึกสำเร็จ"}
            onChange={e=>setForm({...form,orderNumber:e.target.value})}
            readOnly={!form.id||currentUser.role!=="admin"} placeholder="เช่น 1/2569" />
          {Boolean(form.id)&&currentUser.role==="admin"&&<p className="text-xs text-amber-700 mt-1">แก้เลขได้แม้คำสั่งอนุมัติ/ผอ.ลงนามแล้ว แต่จะไม่เปลี่ยนเลขภายในไฟล์ PDF ที่ลงนาม</p>}
                  {!form.id && <p className="text-[10px] text-gray-500 mt-1">เลขจริงจะปรากฏหลังบันทึกสำเร็จ</p>}
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">รายการ (เรื่อง) <span className="text-red-500">*</span></label>
                  <input type="text" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">วันที่ออกคำสั่ง <span className="text-red-500">*</span></label>
                  <input type="date" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={form.orderDate} disabled={Boolean(form.id)} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} required />
                </div>
                
                <div className="grid grid-cols-1 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">ผู้รับผิดชอบ</label>
                    <p className="text-sm font-bold text-gray-800 bg-white border px-3 py-2.5 rounded shadow-sm">
                      {form.id ? reservations.find(r => r.id === form.id)?.responsibleName : currentUser.name}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">กลุ่มงาน/กลุ่มสาระฯ เจ้าของเรื่อง <span className="text-red-500">*</span></label>
                    <select 
                      className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white" 
                      value={form.responsibleDept} 
                      onChange={(e) => setForm({ ...form, responsibleDept: e.target.value })} 
                      required
                    >
                      <option value="">-- ระบุกลุ่มงาน/กลุ่มสาระฯ --</option>
                      {systemSettings?.adminDepts && (
                        <optgroup label="กลุ่มบริหารงาน">
                          {systemSettings.adminDepts.map((d) => <option key={d} value={d}>{d}</option>)}
                        </optgroup>
                      )}
                      {systemSettings?.subjectAreas && (
                        <optgroup label="กลุ่มสาระการเรียนรู้">
                          {systemSettings.subjectAreas.filter(d => d !== "ไม่มีกลุ่มสาระการเรียนรู้").map((d) => <option key={d} value={d}>{d}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">หมายเหตุ</label>
                  <input type="text" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" />
                </div>
              </div>
              
              <div className="p-3 sm:p-5 border-t flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 bg-gray-50 shrink-0">
                <button type="button" onClick={() => setShowModal(false)} disabled={isSubmitting} className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 border border-gray-300 text-gray-700 bg-white rounded-lg font-bold hover:bg-gray-100 transition-colors text-sm">ยกเลิก</button>
                <button type="submit" disabled={isSubmitting} className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 bg-[#003366] hover:bg-blue-900 text-white rounded-lg font-bold shadow-md flex items-center justify-center transition-colors text-sm">
                  {isSubmitting ? <Loader2 className="animate-spin mr-2" size={16} /> : <Save size={16} className="mr-2" />} {form.id ? "บันทึกการแก้ไข" : "บันทึกการจอง"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {docToDelete && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
           <div className="bg-white p-5 sm:p-6 rounded-xl shadow-xl w-full max-w-[95%] sm:max-w-sm text-center animate-fade-in">
             <AlertCircle size={40} className="mx-auto text-red-500 mb-3 sm:mb-4 sm:w-12 sm:h-12" />
             <h3 className="text-base sm:text-lg font-bold mb-2">ยกเลิกเลขคำสั่งนี้?</h3>
             <p className="text-xs sm:text-sm text-gray-500 mb-5 sm:mb-6">เลขที่ยกเลิกจะถูกข้าม ไม่แจกให้ผู้อื่นอัตโนมัติ แต่แอดมินสามารถนำกลับมาใช้ใหม่ได้</p>
             <div className="flex gap-2 sm:gap-3">
               <button onClick={() => setDocToDelete(null)} className="flex-1 px-3 sm:px-4 py-2 bg-gray-100 text-xs sm:text-sm font-bold rounded hover:bg-gray-200 transition-colors">ยกเลิก</button>
               <button onClick={handleDelete} className="flex-1 px-3 sm:px-4 py-2 bg-red-600 text-white text-xs sm:text-sm font-bold rounded hover:bg-red-700 transition-colors">ยืนยันการยกเลิก</button>
             </div>
           </div>
         </div>
      )}
    </div>
  );
}

function DashboardView({ documents, currentUser, dbUsers, systemSettings, changeMenu, showToast, onOpenDocument }) {
  // All counts remain derived from the same permitted documents as the original dashboard.
  const visibleDocs = documents.filter(doc=>canReadDoc(currentUser,doc,dbUsers)||canViewRouted(currentUser,doc,dbUsers,systemSettings));
  const inToday = visibleDocs.filter(doc=>doc.type==="หนังสือเข้า" && doc.date===getTodayIso()).length;
  const circulars = visibleDocs.filter(doc=>doc.type==="หนังสือเวียนแจ้งรับทราบ" && doc.date===getTodayIso()).length;
  const ordersToday = visibleDocs.filter(doc=>doc.type==="คำสั่งโรงเรียน" && doc.date===getTodayIso()).length;
  const myTasks=documents.filter(d=>(currentUser.role==="deputy"&&d.status===DOC_STATUS.WAITING_DEPUTY)||(currentUser.role==="director"&&d.status===DOC_STATUS.WAITING_DIRECTOR)||(currentUser.role==="admin"&&[DOC_STATUS.WAITING_DEPUTY,DOC_STATUS.WAITING_DIRECTOR].includes(d.status))).length;
  const canViewTasks=["admin","director","deputy"].includes(currentUser.role);
  const teacher=currentUser.role==="teacher";
  const reader=["teacher","clerk"].includes(currentUser.role),hasHead=headGroups(currentUser,systemSettings).length>0;
  const headCount=documents.reduce((n,d)=>n+pendingHeadGroups(d,currentUser,systemSettings).length,0);
  const ownAssignments=documents.reduce((n,d)=>n+pendingAssignmentEvents(d,currentUser).length,0);
  const pending=(kind)=>visibleDocs.filter(d=>d.type===kind&&isFinalDoc(d)&&recipientsOf(d,dbUsers).some(r=>r.id===currentUser.id)&&!(d.acknowledgedBy||[]).includes(currentUser.id)).length;
  // Teacher overview represents all accessible documents, not only unread items.
  // Head-routing remains in the sidebar and alerts, regardless of this card layout.
  const teacherTotals=countDocumentTypes(visibleDocs);
  const cards=teacher?[
    {id:"incoming",label:"หนังสือเข้า",value:teacherTotals.incoming,icon:<Inbox size={21}/>,hint:"ทะเบียนหนังสือเข้า"},
    {id:"circulars",label:"หนังสือเวียน",value:teacherTotals.circulars,icon:<Bell size={21}/>,hint:"ทะเบียนหนังสือเวียน"},
    {id:"orders",label:"คำสั่งโรงเรียน",value:teacherTotals.orders,icon:<FileText size={21}/>,hint:"ทะเบียนคำสั่งโรงเรียน"},
    {id:"assignments",label:"งานที่ได้รับมอบหมาย",value:ownAssignments,icon:<CheckCircle size={21}/>,hint:"จาก ผอ. หรือหัวหน้ากลุ่ม"}
  ]:reader?[
    {id:"incoming",label:"หนังสือเข้ารอรับทราบ",value:pending("หนังสือเข้า"),icon:<Inbox size={21}/>,hint:"เปิดหนังสือใหม่"},
    {id:"circulars",label:"หนังสือเวียนรอรับทราบ",value:pending("หนังสือเวียนแจ้งรับทราบ"),icon:<Bell size={21}/>,hint:"อ่านและรับทราบ"},
    hasHead?{id:"routing",label:"รอเกษียณต่อในฐานะหัวหน้า",value:headCount,icon:<FileSignature size={21}/>,hint:"งานหัวหน้ากลุ่ม"}:{id:"orders",label:"คำสั่งรอรับทราบ",value:pending("คำสั่งโรงเรียน"),icon:<FileText size={21}/>,hint:"ทะเบียนคำสั่ง"},
    {id:"assignments",label:"งานที่ได้รับมอบหมาย",value:ownAssignments,icon:<CheckCircle size={21}/>,hint:"จาก ผอ. หรือหัวหน้ากลุ่ม"}
  ]:[
    {id:"incoming",label:"หนังสือเข้าวันนี้",value:inToday,icon:<Inbox size={21}/>,hint:"ทะเบียนหนังสือเข้า"},
    {id:"circulars",label:"หนังสือเวียนวันนี้",value:circulars,icon:<Bell size={21}/>,hint:"หนังสือเวียนแจ้งรับทราบ"},
    {id:"orders",label:"คำสั่งโรงเรียนวันนี้",value:ordersToday,icon:<FileText size={21}/>,hint:"ทะเบียนคำสั่งโรงเรียน"},
    {id:"tasks",label:"งานรอพิจารณา",value:myTasks,icon:<FileSignature size={21}/>,hint:"เปิดงานที่ต้องดำเนินการ"}
  ];
  return (
    <div className="bhs-luxury-dashboard">
      <div className="bhs-luxury-pageheading">
        <div>
          <p className="bhs-luxury-eyebrow">EXECUTIVE OVERVIEW <span></span> ระบบสารบรรณอิเล็กทรอนิกส์</p>
          <h1>ภาพรวมงานสารบรรณ</h1>
          <p className="bhs-luxury-welcome">ยินดีต้อนรับ, <strong>{currentUser.name}</strong> <span className="bhs-luxury-welcome-divider">·</span> {getThaiDateLong()}</p>
          <RoleIndicators user={currentUser} settings={systemSettings}/>
          {(currentUser.adminDept !== "-" || currentUser.subjectArea !== "-") && (
            <div className="bhs-luxury-departments">
              {currentUser.adminDept && currentUser.adminDept !== "-" && <span className="bhs-department-tag">{currentUser.adminDept}</span>}
              {currentUser.subjectArea && currentUser.subjectArea !== "-" && <span className="bhs-subject-tag">{currentUser.subjectArea}</span>}
            </div>
          )}
        </div>
        <div className="bhs-luxury-heading-actions">
          <button type="button" onClick={()=>changeMenu("global_search")} className="bhs-luxury-secondary-btn"><Search size={16}/> ค้นหาเอกสาร</button>
          {canViewTasks && <button type="button" onClick={()=>changeMenu("tasks")} className="bhs-luxury-primary-btn"><FileSignature size={16}/> งานที่ต้องดำเนินการ</button>}
        </div>
      </div>

      <div className="bhs-luxury-summary">
        {cards.map((item,index)=>(
          <button
            key={item.id}
            type="button"
            onClick={()=>!item.disabled && changeMenu(item.id)}
            disabled={item.disabled}
            className={`bhs-luxury-metric ${item.disabled?"is-disabled":""}`}
          >
            <span className="bhs-luxury-metric-top"><span className="bhs-luxury-metric-icon">{item.icon}</span><span className="bhs-luxury-metric-number">0{index+1}</span></span>
            <span className="bhs-luxury-metric-label">{item.label}</span>
            <span className="bhs-luxury-metric-value">{Number(item.value).toLocaleString("th-TH")}</span>
            <span className="bhs-luxury-metric-footer">{item.hint}<span aria-hidden="true">↗</span></span>
          </button>
        ))}
      </div>

      <DashboardHomePanels documents={documents} currentUser={currentUser} dbUsers={dbUsers} systemSettings={systemSettings} changeMenu={changeMenu} onOpenDocument={onOpenDocument}/>
    </div>
  );
}

function IncomingView({ documents, currentUser, dbUsers, systemSettings, changeMenu, showToast }) {
  const incomingDocs = documents.filter((doc) => {
    if (doc.type !== "หนังสือเข้า") return false;
    if (["admin", "director", "deputy", "clerk"].includes(currentUser.role)) return true;
    return canReadDoc(currentUser,doc,dbUsers)||canViewRouted(currentUser,doc,dbUsers,systemSettings);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-lg md:text-xl font-bold text-gray-800">ทะเบียนหนังสือเข้า</h2>
        {["admin", "clerk"].includes(currentUser.role) && (
          <button onClick={() => changeMenu("form_incoming")} className="w-full sm:w-auto bg-[#003366] text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center">
            <Plus size={16} className="mr-2" /> ลงทะเบียนหนังสือ
          </button>
        )}
      </div>
      <AdvancedSearchTable documents={incomingDocs} currentUser={currentUser} dbUsers={dbUsers} systemSettings={systemSettings} allowAcknowledge showToast={showToast} />
    </div>
  );
}

function OrdersView({ documents, currentUser, dbUsers, systemSettings, changeMenu, showToast }) {
  const orders = documents.filter((doc) => doc.type === "คำสั่งโรงเรียน" &&
    (doc.status === DOC_STATUS.COMPLETED || doc.status === DOC_STATUS.PUBLISHED) &&
    (canReadDoc(currentUser,doc,dbUsers)||canViewRouted(currentUser,doc,dbUsers,systemSettings)));
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-lg md:text-xl font-bold text-gray-800">คำสั่งโรงเรียน (อนุมัติแล้ว)</h2>
        {["admin", "clerk", "teacher"].includes(currentUser.role) && (
          <button onClick={() => changeMenu("form_orders")} className="w-full sm:w-auto bg-[#003366] text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center">
            <Plus size={16} className="mr-2" /> สร้างคำสั่ง
          </button>
        )}
      </div>
      <AdvancedSearchTable documents={orders} currentUser={currentUser} dbUsers={dbUsers} systemSettings={systemSettings} allowAcknowledge showToast={showToast} />
    </div>
  );
}

function CircularsView({ documents, currentUser, dbUsers, systemSettings, changeMenu, showToast }) {
  const circulars = documents.filter((doc) => doc.type === "หนังสือเวียนแจ้งรับทราบ" &&
    (doc.status === DOC_STATUS.COMPLETED || doc.status === DOC_STATUS.PUBLISHED) &&
    (canReadDoc(currentUser,doc,dbUsers)||canViewRouted(currentUser,doc,dbUsers,systemSettings)));
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-lg md:text-xl font-bold text-gray-800">หนังสือเวียนแจ้งรับทราบ</h2>
        {["admin", "clerk", "teacher"].includes(currentUser.role) && (
          <button onClick={() => changeMenu("form_circular")} className="w-full sm:w-auto bg-[#003366] text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center">
            <Plus size={16} className="mr-2" /> สร้างหนังสือเวียน
          </button>
        )}
      </div>
      <AdvancedSearchTable documents={circulars} currentUser={currentUser} dbUsers={dbUsers} systemSettings={systemSettings} allowAcknowledge showToast={showToast} />
    </div>
  );
}

function MyDocsView({ documents, currentUser, dbUsers, systemSettings, showToast }) {
  const myDocs = documents.filter((doc) => doc.createdBy === currentUser.id);
  return (
    <div className="space-y-4">
      <h2 className="text-lg md:text-xl font-bold text-gray-800">เอกสารที่ดำเนินการ</h2>
      <AdvancedSearchTable documents={myDocs} currentUser={currentUser} dbUsers={dbUsers} systemSettings={systemSettings} hideFilters={false} showToast={showToast} />
    </div>
  );
}

function TrashView({ documents, currentUser, dbUsers, showToast }) {
  const deletedDocs = documents.filter(d => d.isDeleted);
  
  const handleRestore = async (docId) => {
    try {
      if(documents.find(d=>d.id===docId)?.trialArchived)
        throw new Error("รายการทดลองต้องกู้คืนที่เมนูเลขคำสั่งโรงเรียน เพื่อให้เลขและคำสั่งตรงกัน");
      await updateDoc(getDocumentRef(DOCS_PATH, docId), { isDeleted: false });
      writeAuditLog(currentUser, "กู้คืนเอกสาร", "DOCUMENT", docId, "กู้คืนเอกสารจากถังขยะ");
      showToast("กู้คืนเอกสารสำเร็จ", "success");
    } catch(err) { showToast(err.message, "error"); }
  };

  const handlePermanentDelete = async (docId) => {
    if(documents.find(d=>d.id===docId)?.reservationId){
      showToast("ลบคำสั่งที่เชื่อมทะเบียนจากเมนูเลขคำสั่งโรงเรียน เพื่อให้ลบทั้งสองจุด","error");return;
    }
    if(documents.find(d=>d.id===docId)?.trialArchived){
      showToast("เอกสารทดลองต้องกู้คืนผ่านเมนูเลขคำสั่งโรงเรียนก่อน ไม่อนุญาตลบถาวรจากถังขยะ","error");return;
    }
    if(window.confirm("คุณแน่ใจหรือไม่ที่จะลบเอกสารนี้ถาวร? ข้อมูลจะไม่สามารถกู้คืนได้")) {
      try {
        await deleteDoc(getDocumentRef(DOCS_PATH, docId));
        writeAuditLog(currentUser, "ลบเอกสารถาวร", "DOCUMENT", docId, "ลบเอกสารออกจากฐานข้อมูลอย่างถาวร");
        showToast("ลบถาวรสำเร็จ", "success");
      } catch(err) { showToast(err.message, "error"); }
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-100 border border-gray-300 p-4 rounded-xl flex items-center">
        <Trash2 className="text-gray-500 mr-3" />
        <div>
          <h2 className="font-bold text-gray-800">ถังขยะ (เอกสารที่ถูกลบ)</h2>
          <p className="text-xs text-gray-500">เอกสารเหล่านี้จะไม่แสดงในหน้าระบบปกติ</p>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left text-sm text-gray-600">
           <thead className="bg-gray-50 text-gray-700 text-xs uppercase font-bold border-b">
              <tr><th className="px-4 py-3">รายละเอียดเอกสารที่ถูกลบ</th><th className="px-4 py-3">จัดการ</th></tr>
           </thead>
           <tbody className="divide-y divide-gray-100">
              {deletedDocs.map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                   <td className="px-4 py-3">
                     <p className="font-bold text-gray-800 line-through">{d.subject}</p>
                     <p className="text-xs text-gray-500">{d.type} | จาก: {d.from}</p>
                   </td>
                   <td className="px-4 py-3">
                     <div className="flex gap-2">
                       <button onClick={() => handleRestore(d.id)} className="px-2 py-1 bg-green-50 text-green-700 rounded border border-green-200 text-xs font-bold flex items-center"><RotateCcw size={14} className="mr-1"/> กู้คืน</button>
                       <button onClick={() => handlePermanentDelete(d.id)} className="px-2 py-1 bg-red-50 text-red-700 rounded border border-red-200 text-xs font-bold flex items-center"><Trash2 size={14} className="mr-1"/> ลบถาวร</button>
                     </div>
                   </td>
                </tr>
              ))}
              {deletedDocs.length === 0 && <tr><td colSpan="2" className="text-center py-6 text-gray-500">ไม่มีเอกสารในถังขยะ</td></tr>}
           </tbody>
        </table>
      </div>
    </div>
  )
}

function TasksView({ documents, currentUser, dbUsers, systemSettings, showToast }) {
  const pendingDocs = documents.filter((doc) => {
    if (currentUser.role === "deputy" && doc.status === DOC_STATUS.WAITING_DEPUTY) return true;
    if (currentUser.role === "director" && doc.status === DOC_STATUS.WAITING_DIRECTOR) return true;
    if (currentUser.role === "admin") return doc.status === DOC_STATUS.WAITING_DEPUTY || doc.status === DOC_STATUS.WAITING_DIRECTOR;
    return false;
  });

  const [inputs, setInputs] = useState({});
  const [processingId, setProcessingId] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [signDoc, setSignDoc] = useState(null);
  const signedUploads=useRef(new Map());

  const handleInput = (id, key, value) => setInputs((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));

  const handleRawFileChange = (docId, e) => {
    const files = Array.from(e.target.files);
    setInputs((prev) => ({ ...prev, [docId]: { ...prev[docId], rawSignedFiles: [...(prev[docId]?.rawSignedFiles || []), ...files] } }));
  };

  const removeRawFile = (docId, index) => {
    setInputs((prev) => ({ ...prev, [docId]: { ...prev[docId], rawSignedFiles: prev[docId].rawSignedFiles.filter((_, i) => i !== index) } }));
  };

  const submitAction = async (docObj, actionType, signedPdf = null) => {
    if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.includes("script.google.com/macros/s/AKfycbwY4")) {
      return showToast("กรุณาตั้งค่า GAS_WEB_APP_URL ให้ถูกต้องก่อนใช้งาน", "error");
    }

    const docInput = inputs[docObj.id] || {};
    const isDirectorStage = currentUser.role === "director" || (currentUser.role === "admin" && docObj.status === DOC_STATUS.WAITING_DIRECTOR);
    const isDeputyStage = currentUser.role === "deputy" || (currentUser.role === "admin" && docObj.status === DOC_STATUS.WAITING_DEPUTY);
    
    if (actionType === "APPROVE" && isDirectorStage && docObj.type === "หนังสือเข้า") {
      const groupIds=docInput.routeGroups||[],individualIds=docInput.routeUserIds||[];
      if(!docInput.routeAll&&!groupIds.length&&!individualIds.length)
        return showToast("กรุณาเลือกกลุ่มงาน กลุ่มสาระ หรือครูผู้รับอย่างน้อยหนึ่งรายการ","error");
      if(!signedPdf) {
        const names=individualIds.map(id=>dbUsers.find(u=>u.id===id)?.name).filter(Boolean);
        const message="ตรวจสอบก่อนเกษียณหนังสือ:\nเรื่อง "+docObj.subject+"\nกลุ่ม: "+(docInput.routeAll?"ทุกคน":groupIds.join(", ")||"—")+"\nถึงครู: "+(names.join(", ")||"—")+"\nข้อสั่งการ: "+(docInput.command||"อนุมัติ / ดำเนินการ")+"\n\nยืนยันการเกษียณ?";
        if(!window.confirm(message))return;
      }
    }

    if (actionType === "APPROVE" && isDirectorStage && docObj.type === "คำสั่งโรงเรียน" && !signedPdf) {
      setSignDoc(docObj);
      return;
    }
    setProcessingId(docObj.id);
    let updates = {};

    const createHistoryEntry = (actionName, detailTxt) => ({
      action: actionName,
      by: currentUser.id,
      byName: currentUser.name,
      role: ROLES[currentUser.role.toUpperCase()]?.name,
      timestamp: Date.now(),
      detail: detailTxt || "-"
    });

    try {
      if (actionType === "RETURN") {
        const reason = isDirectorStage ? docInput.command : docInput.comment;
        
        if (!reason || reason.trim() === "") {
          setProcessingId(null);
          return showToast("กรุณาระบุเหตุผลที่ส่งกลับแก้ไขในช่องข้อความด้านบน", "error");
        }
        
        setUploadStatus("กำลังส่งกลับเอกสาร...");
        updates = { 
          returnedAt: Date.now(), lastEventAt: Date.now(),
          status: DOC_STATUS.RETURNED, 
          rejectReason: reason,
          history: arrayUnion(createHistoryEntry("ส่งกลับแก้ไข", reason))
        };

      } else if (isDeputyStage) {
        const commentTxt = docInput.comment || "เห็นควรดำเนินการตามเสนอ";
        setUploadStatus("กำลังเสนอผู้อำนวยการ...");
        updates = { 
          sentToDirectorAt: Date.now(), lastEventAt: Date.now(),
          status: DOC_STATUS.WAITING_DIRECTOR, 
          deputyComment: commentTxt,
          history: arrayUnion(createHistoryEntry("เสนอผู้อำนวยการ", commentTxt))
        };

      } else {
        let uploadedSignedFiles = [];
        if (docObj.type === "คำสั่งโรงเรียน") {
          if (!signedPdf) throw new Error("ต้องลงนาม PDF ก่อนอนุมัติคำสั่ง");
          setUploadStatus("กำลังจัดเก็บ PDF ที่ลงนามแล้ว...");
          // The signing page stays open after a failure; already uploaded file objects are reused.
          const originals=Array.isArray(signedPdf)?signedPdf:[signedPdf];
          const current=await getDoc(getDocumentRef(DOCS_PATH,docObj.id));
          if(!current.exists()||fileIdentity(current.data())!==fileIdentity(docObj))
            throw new Error("ข้อมูล PDF เปลี่ยนหลังจากเปิดเอกสาร กรุณาเปิดฉบับล่าสุดแล้วลงนามใหม่");
          const cacheKey=`${docObj.id}:${fileIdentity(docObj)}`;
          const cached=signedUploads.current.get(cacheKey)||[];
          for(let i=cached.length;i<originals.length;i++){
            setUploadStatus(`กำลังอัปโหลดไฟล์ลงนาม ${i+1}/${originals.length}`);
            cached.push(await uploadFileToGoogleDrive(originals[i]));
            signedUploads.current.set(cacheKey,[...cached]);
          }
          uploadedSignedFiles=[...cached];
          if(uploadedSignedFiles.length!==originals.length)throw new Error("บันทึกไฟล์ลงนามไม่ครบ");
        } else if (docInput.rawSignedFiles?.length) {
          uploadedSignedFiles = await uploadMultipleFilesToDrive(docInput.rawSignedFiles, setUploadStatus);
        }
        const cmdTxt = docInput.command || "อนุมัติ / ดำเนินการ";
        setUploadStatus("กำลังบันทึกข้อมูลลงฐานระบบ...");
        const publishAt=Date.now();
        const groups=docInput.routeGroups||[];
        const userIds=docInput.routeUserIds||[];
        const all=docObj.type==="หนังสือเข้า"?!!docInput.routeAll:true;
        const recipientList=audienceSnapshot({groups,users:userIds,all},dbUsers,[],currentUser.id,publishAt);
        const routingEntry={...routeMessage("director",currentUser,docObj),at:publishAt,groups,userIds,all,message:cmdTxt};
        updates = {
          recipientsSnapshot:recipientList,
          routingEntries:[...(docObj.routingEntries||[]),routingEntry],
          lastEventAt: publishAt,
          status: docObj.type === "คำสั่งโรงเรียน" || docObj.type === "หนังสือเวียนแจ้งรับทราบ" ? DOC_STATUS.PUBLISHED : DOC_STATUS.COMPLETED,
          publishedAt: Date.now(),
          directorCommand: cmdTxt,
          assignedTo: all?"ทุกคน":groups.length===1?groups[0]:groups.length?"หลายกลุ่ม":userIds.length?"ระบุบุคคล":"",
          signedFiles: uploadedSignedFiles,
          history: arrayUnion(createHistoryEntry("อนุมัติและเผยแพร่", cmdTxt))
        };
      }
      
      const actionText = actionType === "RETURN" ? "ส่งกลับแก้ไข" : isDeputyStage ? "เสนอผู้อำนวยการ" : "อนุมัติและเผยแพร่";
      await commitCheckedAction(currentUser, docObj, updates, actionText, docObj.subject);
      if (signedPdf) {
        signedUploads.current.delete(`${docObj.id}:${fileIdentity(docObj)}`);
        setSignDoc(null);
      }
      showToast("ดำเนินการเอกสารสำเร็จ", "success");
      
      setInputs((prev) => { const next = {...prev}; delete next[docObj.id]; return next; });
    } catch (err) {
      showToast("ดำเนินการไม่สำเร็จ: " + err.message, "error");
      if(signedPdf){setProcessingId(null);setUploadStatus("");throw err;}
    }
    setProcessingId(null);
    setUploadStatus("");
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {signDoc && <PdfSignatureEditor
        document={signDoc}
        onCancel={()=>setSignDoc(null)}
        onSubmit={async file=>submitAction(signDoc,"APPROVE",file)}
        busy={processingId === signDoc.id}
      />}
      <div className="bg-red-50 p-4 rounded-xl shadow-sm border border-red-200 flex justify-between items-center">
        <div>
          <h2 className="text-base md:text-lg font-bold text-red-800">งานที่ต้องพิจารณา / ลงนาม</h2>
          <p className="text-xs md:text-sm text-red-600 mt-1">รอการตรวจสอบ {pendingDocs.length} รายการ</p>
        </div>
        <FileSignature size={32} className="text-red-300 md:w-9 md:h-9 shrink-0" />
      </div>

      {pendingDocs.length === 0 ? (
        <div className="bg-white p-8 md:p-12 text-center text-gray-500 rounded-xl shadow-sm border border-gray-200 flex flex-col items-center justify-center">
          <CheckCircle size={48} className="text-green-400 mb-4" />
          <h3 className="text-base md:text-lg font-bold text-gray-700">ไม่มีงานค้างในระบบ</h3>
        </div>
      ) : (
        <div className="grid gap-4">
          {pendingDocs.map((docObj) => (
            <div key={docObj.id} className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-200 w-full overflow-hidden">
              <div className="mb-3">
                <div className="flex flex-wrap gap-2 mb-2 items-center">
                  <span className="text-[10px] md:text-[11px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded">{docObj.type}</span>
                  <span className="text-[10px] md:text-[11px] font-bold px-2 py-0.5 bg-yellow-100 text-yellow-800 border border-yellow-200 rounded">{docObj.status}</span>
                  {docObj.urgency && docObj.urgency !== "ปกติ" && (
                     <span className={`text-[10px] md:text-[11px] font-bold px-2 py-0.5 rounded text-white ${docObj.urgency === 'ด่วนที่สุด' ? 'bg-red-600' : docObj.urgency === 'ด่วนมาก' ? 'bg-red-500' : 'bg-orange-500'}`}>
                       {docObj.urgency}
                     </span>
                  )}
                </div>
                <h3 className="font-bold text-base md:text-lg text-gray-800 mt-1 break-words">{docObj.subject}</h3>
                
                <div className="text-xs md:text-sm text-gray-500 mt-2 space-y-1">
                   {docObj.type === "หนังสือเข้า" && <p><span className="font-bold text-gray-700">เลขรับ:</span> {docObj.docNumber || "-"}</p>}
                   {docObj.type === "คำสั่งโรงเรียน" && <p><span className="font-bold text-gray-700">เลขที่คำสั่ง:</span> {docObj.docNumber || "-"}</p>}
                   <p><span className="font-bold text-gray-700">วันที่:</span> {formatThaiDate(docObj.date)}</p>
                   <p><span className="font-bold text-gray-700">จาก:</span> <span className="break-words">{docObj.from} {docObj.department && `(${docObj.department})`}</span></p>
                </div>
              </div>

              {docObj.files?.length > 0 && (
                <div className="bg-gray-50 p-2.5 md:p-3 rounded-lg mb-2 flex flex-wrap gap-2 items-center border border-gray-100">
                  <span className="text-[9px] md:text-[10px] font-bold text-gray-500 uppercase w-full md:w-auto">📄 {docObj.type === "หนังสือเข้า" ? "ไฟล์หนังสือเข้า" : "ไฟล์เสนอพิจารณา (ต้นฉบับ)"}:</span>
                  {docObj.files.map((f, i) => (
                    <a key={i} href={f.url} target="_blank" rel="noreferrer" onClick={() => writeAuditLog(currentUser, "ดาวน์โหลด/เปิดไฟล์", "FILE", f.name, `เปิดไฟล์ต้นฉบับ: ${f.name}`)} className="inline-flex items-center text-[10px] md:text-xs bg-white border border-blue-200 text-blue-600 px-2 md:px-3 py-1.5 rounded-md hover:bg-blue-50 shadow-sm font-medium truncate max-w-full">
                      <Download size={14} className="mr-1.5 shrink-0" /> <span className="truncate">{f.name}</span>
                    </a>
                  ))}
                </div>
              )}
              {docObj.signedFiles?.length > 0 && (
                <div className="bg-green-50 p-2.5 md:p-3 rounded-lg mb-4 flex flex-wrap gap-2 items-center border border-green-100">
                  <span className="text-[9px] md:text-[10px] font-bold text-green-700 uppercase w-full md:w-auto">✅ {docObj.type === "หนังสือเข้า" ? "ไฟล์หนังสือเข้า" : "ไฟล์ฉบับสมบูรณ์ (สั่งการแล้ว)"}:</span>
                  {docObj.signedFiles.map((f, i) => (
                    <a key={i} href={f.url} target="_blank" rel="noreferrer" onClick={() => writeAuditLog(currentUser, "ดาวน์โหลด/เปิดไฟล์", "FILE", f.name, `เปิดไฟล์ฉบับสมบูรณ์: ${f.name}`)} className="inline-flex items-center text-[10px] md:text-xs bg-white border border-green-300 text-green-700 px-2 md:px-3 py-1.5 rounded-md hover:bg-green-100 shadow-sm font-medium truncate max-w-full">
                      <Download size={14} className="mr-1.5 shrink-0" /> <span className="truncate">{f.name}</span>
                    </a>
                  ))}
                </div>
              )}

              {docObj.deputyComment && (
                <div className="bg-blue-50 border-l-4 border-blue-400 p-3 md:p-4 mb-4 rounded-r-lg text-xs md:text-sm text-blue-800 shadow-sm">
                  <strong className="block mb-1">ความเห็นรองผู้อำนวยการ:</strong>{docObj.deputyComment}
                </div>
              )}

              {(currentUser.role === "deputy" || (currentUser.role === "admin" && docObj.status === DOC_STATUS.WAITING_DEPUTY)) && (
                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <textarea className="w-full border rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" rows="2" placeholder="พิมพ์ความเห็น หรือ เหตุผลกรณีส่งกลับแก้ไข..." value={inputs[docObj.id]?.comment || ""} onChange={(e) => handleInput(docObj.id, "comment", e.target.value)}></textarea>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <button onClick={() => submitAction(docObj, "APPROVE")} disabled={processingId === docObj.id} className="w-full sm:flex-1 bg-[#003366] text-white py-2.5 rounded-lg font-bold shadow flex justify-center items-center">
                      {processingId === docObj.id ? <><Loader2 className="animate-spin mr-2" size={18} /> {uploadStatus}</> : "เสนอผู้อำนวยการ"}
                    </button>
                    <button onClick={() => submitAction(docObj, "RETURN")} disabled={processingId === docObj.id} className="w-full sm:flex-1 bg-red-50 border border-red-200 text-red-700 py-2.5 rounded-lg font-bold mt-2 sm:mt-0">
                      ส่งกลับแก้ไข
                    </button>
                  </div>
                </div>
              )}

              {(currentUser.role === "director" || (currentUser.role === "admin" && docObj.status === DOC_STATUS.WAITING_DIRECTOR)) && (
                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <textarea className="w-full border rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" rows="2" placeholder="ข้อสั่งการ หรือ เหตุผลกรณีส่งกลับแก้ไข..." value={inputs[docObj.id]?.command || ""} onChange={(e) => handleInput(docObj.id, "command", e.target.value)}></textarea>
                  {docObj.type === "หนังสือเข้า" && (
                    <div className="bg-slate-50 border rounded-xl p-3 space-y-2">
                      <p className="font-bold text-sm text-slate-700">เลือกกลุ่มงาน กลุ่มสาระ หรือครูโดยตรง</p>
                      <RoutingPicker dbUsers={dbUsers} systemSettings={systemSettings}
                        groups={inputs[docObj.id]?.routeGroups||[]} setGroups={v=>handleInput(docObj.id,"routeGroups",v)}
                        userIds={inputs[docObj.id]?.routeUserIds||[]} setUserIds={v=>handleInput(docObj.id,"routeUserIds",v)}
                        all={!!inputs[docObj.id]?.routeAll} setAll={v=>handleInput(docObj.id,"routeAll",v)} allowAll/>
                    </div>
                  )}
                  {docObj.type === "หนังสือเวียนแจ้งรับทราบ" && (
                    <div className="bg-gray-50 p-3 md:p-4 rounded-lg border border-gray-200">
                      <label className="text-xs md:text-sm font-bold text-gray-700 block mb-2">แนบไฟล์ที่ลงนาม/เกษียณแล้ว</label>
                      <label className="cursor-pointer text-xs md:text-sm bg-white border border-gray-300 px-3 md:px-4 py-2 rounded-lg inline-flex items-center hover:bg-gray-100 shadow-sm font-medium">
                        <FileUp size={16} className="mr-2 text-blue-600 shrink-0" /> เลือกไฟล์
                        <input type="file" className="hidden" multiple onChange={(e) => handleRawFileChange(docObj.id, e)} accept=".pdf,image/*" />
                      </label>
                      {inputs[docObj.id]?.rawSignedFiles?.map((f, i) => (
                        <div key={i} className="flex justify-between items-center text-[10px] md:text-xs bg-white border border-green-200 mt-2 p-2 rounded shadow-sm">
                          <span className="text-green-700 font-bold truncate pr-2">{f.name}</span>
                          <button onClick={() => removeRawFile(docObj.id, i)} className="text-red-500 shrink-0"><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <button onClick={() => submitAction(docObj, "APPROVE")} disabled={processingId === docObj.id} className="w-full sm:flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold shadow-md flex justify-center items-center">
                      {processingId === docObj.id ? <><Loader2 className="animate-spin mr-2" size={18} /> {uploadStatus}</> : <><CheckCircle size={18} className="mr-2 shrink-0" /> {["คำสั่งโรงเรียน","หนังสือเวียนแจ้งรับทราบ"].includes(docObj.type)?"ลงนาม / อนุมัติ":"อนุมัติ / สั่งการ"}</>}
                    </button>
                    <button onClick={() => submitAction(docObj, "RETURN")} disabled={processingId === docObj.id} className="w-full sm:flex-1 bg-red-50 border border-red-200 text-red-700 py-3 rounded-lg font-bold mt-2 sm:mt-0">
                      ส่งกลับแก้ไข
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdvancedSearchTable({ documents, title, currentUser, dbUsers, systemSettings, hideFilters = false, allowAcknowledge = false, showToast }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filterYear, setFilterYear] = useState("");
  const [versionsDoc, setVersionsDoc] = useState(null);
  const [extraDoc,setExtraDoc]=useState(null);
  const [extraFiles,setExtraFiles]=useState([]);
  const [extraReason,setExtraReason]=useState("");
  const [extraBusy,setExtraBusy]=useState(false);
  const saveExtra=async()=>{
    if(!extraDoc||!extraFiles.length||!extraReason.trim())return showToast("เลือกไฟล์และระบุเหตุผลก่อน","error");
    setExtraBusy(true);
    try{
      const files=await uploadMultipleFilesToDrive(extraFiles);
      const existing=await getDoc(getDocumentRef(DOCS_PATH,extraDoc.id));
      if(!existing.exists()||![DOC_STATUS.PUBLISHED,DOC_STATUS.COMPLETED].includes(existing.data().status))throw new Error("สถานะเอกสารเปลี่ยนไป กรุณาเปิดใหม่");
      const entries=files.map(f=>({...f,addedBy:currentUser.id,addedByName:currentUser.name,addedAt:Date.now(),reason:extraReason.trim(),postApproval:true}));
      const batch=writeBatch(db);
      batch.update(getDocumentRef(DOCS_PATH,extraDoc.id),{extraAttachments:[...(existing.data().extraAttachments||[]),...entries],history:arrayUnion({action:"เพิ่มไฟล์ประกอบหลังอนุมัติ",by:currentUser.id,byName:currentUser.name,timestamp:Date.now(),detail:extraReason.trim()}),lastEventAt:Date.now()});
      batch.set(doc(getCollectionRef(AUDIT_LOG_PATH)),auditPayload(currentUser,"เพิ่มไฟล์ประกอบหลังอนุมัติ","DOCUMENT",extraDoc.id,extraReason.trim()));
      await batch.commit();showToast("แนบไฟล์ประกอบสำเร็จ","success");setExtraDoc(null);setExtraFiles([]);setExtraReason("");
    }catch(e){showToast(`แนบไฟล์ไม่สำเร็จ: ${e.message}`,"error")}finally{setExtraBusy(false)}
  };
  
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [showFilterBar, setShowFilterBar] = useState(false);

  const [ackModalDoc, setAckModalDoc] = useState(null);
  const [historyModalDoc, setHistoryModalDoc] = useState(null);
  const [docToDelete, setDocToDelete] = useState(null);
  
  const [docToEdit, setDocToEdit] = useState(null);
  const [editForm, setEditForm] = useState({ subject: "", docNumber: "", date: "", urgency: "ปกติ", from: "", type: "" });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  
  const [docToResubmit, setDocToResubmit] = useState(null);
  const [resubmitForm, setResubmitForm] = useState({ subject: "" });
  const [resubmitNewFiles, setResubmitNewFiles] = useState([]);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [resubmitStatus, setResubmitStatus] = useState("");
  
  const filtered = documents.filter((doc) => {
    if (filterYear && buddhistYear(doc.date) !== Number(filterYear)) return false;
    if (filterType && doc.type !== filterType) return false;
    if (filterStatus && doc.status !== filterStatus) return false;
    if (filterDate && doc.date !== filterDate) return false;
    return (doc.subject + doc.type + doc.from + (doc.docNumber||"")).toLowerCase().includes(search.toLowerCase());
  });

  useEffect(()=>setPage(1),[search,filterType,filterStatus,filterDate,filterYear,pageSize]);
  const sortedFiltered = sortUrgency(filtered);
  const pagedDocs = sortedFiltered.slice((page-1)*pageSize, page*pageSize);
  const isAcknowledgeRole = ["clerk", "teacher"].includes(currentUser.role);
  
  const getDocTargetUsers = (docObj) => recipientsOf(docObj,dbUsers);

  const handleAcknowledge = async (docId) => {
    try {
      const latest=await getDoc(getDocumentRef(DOCS_PATH,docId));
      if(!latest.exists()||!isRecipient(latest.data(),currentUser,dbUsers))throw new Error("คุณไม่ได้อยู่ในรายชื่อผู้รับเอกสารนี้");
      await commitDocumentWithAudit(currentUser, docId, { acknowledgedBy: arrayUnion(currentUser.id),[`acknowledgedAt.${currentUser.id}`]:Date.now() }, "รับทราบเอกสาร", "ผู้ใช้กดรับทราบเอกสาร");
      showToast("รับทราบเอกสารเรียบร้อย", "success");
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
  };

  const executeDeleteDoc = async () => {
    if(!docToDelete) return;
    try {
      await commitDocumentWithAudit(currentUser, docToDelete, {
        isDeleted: true, deletedAt: Date.now(), deletedBy: currentUser.id
      }, "ลบ/ซ่อนเอกสาร", "ย้ายเอกสารลงถังขยะ");
      showToast("ย้ายเอกสารลงถังขยะแล้ว", "success");
    } catch(err) {
      showToast("ลบไม่สำเร็จ: " + err.message, "error");
    }
    setDocToDelete(null);
  };

  const openEditDocModal = (docObj) => {
    setEditForm({ 
       subject: docObj.subject || "", 
       docNumber: docObj.docNumber || "",
       date: docObj.date || "", 
       urgency: docObj.urgency || "ปกติ",
       from: docObj.from || "", 
       type: docObj.type || "" 
    });
    setDocToEdit(docObj);
  };

  const handleSaveEditDoc = async () => {
    if(docToEdit?.type==="คำสั่งโรงเรียน"&&docToEdit?.reservationId&&editForm.docNumber!==docToEdit.docNumber)
      return showToast("แก้เลขคำสั่งที่มีทะเบียนเชื่อมจากเมนูเลขคำสั่งโรงเรียนเท่านั้น","error");
    if(!editForm.subject || !editForm.from || !editForm.date) return showToast("กรุณากรอกข้อมูลให้ครบถ้วน", "error");
    setIsSavingEdit(true);
    try {
      await updateDoc(getDocumentRef(DOCS_PATH, docToEdit.id), { 
        subject: editForm.subject, 
        docNumber: editForm.docNumber,
        date: editForm.date, 
        urgency: editForm.urgency,
        from: editForm.from, 
        type: editForm.type,
        history: arrayUnion({ action: "ผู้ดูแลระบบแก้ไขข้อมูล", by: currentUser.id, byName: currentUser.name, role: ROLES[currentUser.role.toUpperCase()]?.name, timestamp: Date.now(), detail: "-" })
      });
      writeAuditLog(currentUser, "แก้ไขเอกสาร", "DOCUMENT", docToEdit.id, `แก้ไขเรื่อง: ${editForm.subject}`);
      showToast("แก้ไขข้อมูลเอกสารสำเร็จ", "success");
      setDocToEdit(null);
    } catch(err) {
      showToast("แก้ไขไม่สำเร็จ: " + err.message, "error");
    }
    setIsSavingEdit(false);
  };

  const openResubmitModal = (docObj) => {
    setResubmitForm({ subject: docObj.subject || "" });
    setResubmitNewFiles([]);
    setDocToResubmit(docObj);
  };

  const handleResubmit = async () => {
    if (!resubmitForm.subject) return showToast("กรุณาระบุชื่อเรื่อง", "error");
    setIsResubmitting(true);
    setResubmitStatus("เตรียมส่งเรื่องใหม่...");
    try {
      let uploadedFiles = [];
      if (resubmitNewFiles.length > 0) {
        uploadedFiles = await uploadMultipleFilesToDrive(resubmitNewFiles, setResubmitStatus);
      }
      setResubmitStatus("กำลังอัปเดตระบบ...");
      
      const newFilesArray = uploadedFiles.length ? uploadedFiles : (docToResubmit.files || []);
      const nextVersion = (docToResubmit.activeFileVersion || 1) + (uploadedFiles.length ? 1 : 0);
      const previousVersions = docToResubmit.fileVersions || [{ version:1, files:docToResubmit.files || [], timestamp:docToResubmit.createdAt || Date.now() }];
      
      await commitDocumentWithAudit(currentUser, docToResubmit.id, {
        subject: resubmitForm.subject,
        files: newFilesArray,
        fileVersions: uploadedFiles.length ? [...previousVersions, {version:nextVersion,files:newFilesArray,timestamp:Date.now(),reason:"ส่งกลับแก้ไข"}] : previousVersions,
        activeFileVersion: nextVersion,
        status: DOC_STATUS.WAITING_DEPUTY,
        rejectReason: "",
        deputyComment: "",
        directorCommand: "",
        history: arrayUnion({ action: "แก้ไขและส่งเรื่องใหม่", by: currentUser.id, byName: currentUser.name, role: ROLES[currentUser.role.toUpperCase()]?.name, timestamp: Date.now(), detail: "ส่งกลับเข้ากระบวนการอีกครั้ง" })
      }, "แก้ไขและส่งเรื่องใหม่", resubmitForm.subject);
      showToast("ส่งเรื่องกลับเข้าสู่กระบวนการพิจารณาแล้ว", "success");
      setDocToResubmit(null);
    } catch (err) {
      showToast("ส่งเรื่องไม่สำเร็จ: " + err.message, "error");
    }
    setIsResubmitting(false);
    setResubmitStatus("");
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden w-full">
      {title && <div className="p-4 md:p-5 border-b font-bold text-gray-800 bg-gray-50">{title}</div>}
      
      {!hideFilters && (
        <div className="border-b bg-white">
          <div className="p-3 md:p-4 flex flex-col md:flex-row gap-3 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input type="text" placeholder="ค้นหาเรื่อง, เลขที่คำสั่ง, ผู้ส่ง..." className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button onClick={() => setShowFilterBar(!showFilterBar)} className={`w-full md:w-auto px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-colors border ${showFilterBar ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              <Filter size={16} className="mr-2"/> ตัวกรอง
            </button>
          </div>
          
          {showFilterBar && (
             <div className="p-3 md:p-4 bg-gray-50 border-t grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in">
               <label className="block text-xs font-bold text-gray-600">ปี พ.ศ.
                 <select className="w-full border rounded px-2 py-2 text-xs mt-1" value={filterYear} onChange={e=>setFilterYear(e.target.value)}>
                   <option value="">ทุกปี</option>
                   {[...new Set(documents.map(d=>buddhistYear(d.date)).filter(y=>y>=2500))].sort((a,b)=>b-a).map(y=><option key={y} value={y}>{y}</option>)}
                 </select>
               </label>
               <label className="block text-xs font-bold text-gray-600">รายการต่อหน้า
                 <select className="w-full border rounded px-2 py-2 text-xs mt-1" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>
                   <option value={20}>20 / หน้า</option><option value={40}>40 / หน้า</option><option value={60}>60 / หน้า</option>
                 </select>
               </label>
               <div>
                 <label className="block text-xs font-bold text-gray-600 mb-1">ประเภทเอกสาร</label>
                 <select className="w-full border p-2 rounded text-sm bg-white" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                   <option value="">ทั้งหมด</option><option value="หนังสือเข้า">หนังสือเข้า</option><option value="คำสั่งโรงเรียน">คำสั่งโรงเรียน</option><option value="หนังสือเวียนแจ้งรับทราบ">หนังสือเวียนแจ้งรับทราบ</option>
                 </select>
               </div>
               <div>
                 <label className="block text-xs font-bold text-gray-600 mb-1">สถานะ</label>
                 <select className="w-full border p-2 rounded text-sm bg-white" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                   <option value="">ทั้งหมด</option>
                   {Object.values(DOC_STATUS).map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
               </div>
               <div>
                 <label className="block text-xs font-bold text-gray-600 mb-1">วันที่สร้าง</label>
                 <input type="date" className="w-full border p-2 rounded text-sm bg-white" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
               </div>
               <div className="md:col-span-3 text-right">
                 <button onClick={() => { setFilterType(""); setFilterStatus(""); setFilterDate(""); }} className="text-xs text-blue-600 hover:underline">ล้างตัวกรองทั้งหมด</button>
               </div>
             </div>
          )}
        </div>
      )}
      
      <div className="overflow-x-auto w-full">
        <table className="bhs-doc-table min-w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-gray-700 text-xs uppercase font-bold border-b border-gray-200">
            <tr>
              <th className="px-4 md:px-5 py-3 md:py-4 min-w-[200px] md:min-w-[300px]">รายละเอียดเอกสาร</th>
              <th className="px-4 md:px-5 py-3 md:py-4 min-w-[200px]">การสั่งการ / สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {pagedDocs.map((docObj) => {
              const docTargetUsers = getDocTargetUsers(docObj);
              const isUserTarget = docTargetUsers.some(u => u.id === currentUser.id);
              const ackCount = docTargetUsers.filter(u => docObj.acknowledgedBy?.includes(u.id)).length;
              const totalCount = docTargetUsers.length;
              const currentUserAcked = docObj.acknowledgedBy?.includes(currentUser.id);

              return (
                <tr key={docObj.id} className="hover:bg-blue-50/30 transition-colors">
                <td className="px-4 md:px-5 py-4 align-top w-1/2">
                  <div className="font-bold text-gray-900 text-sm md:text-base mb-1 break-words flex items-center flex-wrap gap-2">
                    {docObj.urgency && docObj.urgency !== "ปกติ" && (
                       <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${docObj.urgency === 'ด่วนที่สุด' ? 'bg-red-600' : docObj.urgency === 'ด่วนมาก' ? 'bg-red-500' : 'bg-orange-500'}`}>
                         {docObj.urgency}
                       </span>
                    )}
                    {docObj.subject}
                    <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2 py-0.5 whitespace-nowrap">แนบ {(docObj.files?.length||0)+(docObj.signedFiles?.length||0)+(docObj.extraAttachments?.length||0)} ไฟล์</span>
                    {docObj.date === getTodayIso() && <span className="bhs-new-today-badge text-[10px] md:text-[11px] font-extrabold px-2.5 py-0.5 rounded-full whitespace-nowrap">ใหม่ วันนี้</span>}
                  </div>
                  <div className="text-[11px] md:text-xs text-gray-500 mb-0.5 flex flex-wrap gap-x-3 gap-y-1">
                       {docObj.type === "หนังสือเข้า" && <span><span className="font-medium text-gray-700">เลขรับ:</span> {docObj.docNumber || "-"}</span>}
                       {docObj.type === "คำสั่งโรงเรียน" && <span><span className="font-medium text-gray-700">เลขที่คำสั่ง:</span> {docObj.docNumber || "-"}</span>}
                       <span><span className="font-medium text-gray-700">วันที่:</span> {formatThaiDate(docObj.date)}</span>
                       <span><span className="font-medium text-gray-700">ประเภท:</span> {docObj.type}</span>
                    </div>
                    <div className="text-[11px] md:text-xs text-gray-500 mb-3">
                       <span className="font-medium text-gray-700">จาก:</span> <span className="break-words">{docObj.from} {docObj.department && <span className="text-gray-400">({docObj.department})</span>}</span>
                    </div>
                    
                    {docObj.files?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 items-center bg-gray-50 p-2 md:p-2.5 rounded-lg border border-gray-200">
                        <span className="text-[9px] md:text-[10px] font-bold text-gray-500 uppercase w-full md:w-auto">📄 {docObj.type === "หนังสือเข้า" ? "ไฟล์หนังสือเข้า" : "ไฟล์เสนอพิจารณา (ต้นฉบับ)"}:</span>
                        {docObj.files.map((f, i) => (
                          <a key={i} href={f.url} target="_blank" rel="noreferrer" onClick={() => writeAuditLog(currentUser, "ดาวน์โหลด/เปิดไฟล์", "FILE", f.name, `เปิดไฟล์ต้นฉบับ: ${f.name}`)} className="text-[10px] md:text-[11px] font-bold bg-white border border-blue-300 text-blue-600 px-2 md:px-3 py-1.5 rounded-md shadow-sm hover:bg-blue-50 transition-colors flex items-center max-w-full">
                            <FileIcon size={12} className="mr-1.5 shrink-0" /> <span className="truncate">{f.name}</span>
                          </a>
                        ))}
                      </div>
                    )}
                    {docObj.signedFiles?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 items-center bg-green-50 p-2 md:p-2.5 rounded-lg border border-green-100">
                        <span className="text-[9px] md:text-[10px] font-bold text-green-700 uppercase w-full md:w-auto">✅ {docObj.type === "หนังสือเข้า" ? "ไฟล์หนังสือเข้า" : "ฉบับสมบูรณ์"}:</span>
                        {docObj.signedFiles.map((f, i) => (
                          <a key={i} href={f.url} target="_blank" rel="noreferrer" onClick={() => writeAuditLog(currentUser, "ดาวน์โหลด/เปิดไฟล์", "FILE", f.name, `เปิดไฟล์ฉบับสมบูรณ์: ${f.name}`)} className="text-[10px] md:text-[11px] font-bold bg-white border border-green-300 text-green-700 px-2 md:px-3 py-1.5 rounded-md shadow-sm hover:bg-green-100 transition-colors flex items-center max-w-full">
                            <FileIcon size={12} className="mr-1.5 shrink-0" /> <span className="truncate">{f.name}</span>
                          </a>
                        ))}
                      </div>
                    )}
                    
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button onClick={() => setVersionsDoc(docObj)} className="text-[10px] text-blue-700 underline">ประวัติไฟล์ทุกฉบับ</button>
                      <button onClick={() => setHistoryModalDoc(docObj)} className="text-[10px] md:text-xs text-gray-500 hover:text-blue-600 flex items-center font-medium bg-gray-100 hover:bg-blue-50 px-2 py-1 rounded transition-colors">
                        <History size={14} className="mr-1" /> ดูประวัติการดำเนินการ
                      </button>
                    </div>
                  </td>
                  
                  <td className="px-4 md:px-5 py-4 align-top text-[11px] md:text-xs w-1/2">
                    <div className="mb-3"><StatusBadge status={docObj.status} /></div>
                    <div className="space-y-2">
                      {docObj.assignedTo && <div className="bg-yellow-50 border border-yellow-100 p-2 rounded"><span className="font-bold text-yellow-800">แจ้ง/มอบหมาย:</span> <span className="text-yellow-700 break-words">{docObj.assignedTo}</span></div>}
                      {docObj.directorCommand && <div className="bg-green-50 border border-green-100 p-2 rounded"><span className="font-bold text-green-800">ผอ.:</span> <span className="text-green-700 break-words">{docObj.directorCommand}</span></div>}
                      {docObj.deputyComment && <div className="bg-blue-50 border border-blue-100 p-2 rounded"><span className="font-bold text-blue-800">รองฯ:</span> <span className="text-blue-700 break-words">{docObj.deputyComment}</span></div>}
                      {docObj.rejectReason && <div className="bg-red-50 border border-red-100 p-2 rounded"><span className="font-bold text-red-800">ส่งกลับแก้ไข:</span> <span className="text-red-700 break-words">{docObj.rejectReason}</span></div>}
                    </div>
                    
                    {allowAcknowledge && (docObj.status === DOC_STATUS.COMPLETED || docObj.status === DOC_STATUS.PUBLISHED) && (
                      <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col xl:flex-row xl:items-center justify-between gap-2">
                        <div className="w-full xl:w-auto">
                          {isAcknowledgeRole && isUserTarget ? (
                            <button onClick={() => handleAcknowledge(docObj.id)} disabled={currentUserAcked} className={`w-full xl:w-auto px-3 md:px-4 py-2 rounded-lg font-bold text-[10px] md:text-[11px] shadow-sm transition-colors flex items-center justify-center ${currentUserAcked ? "bg-green-100 text-green-700 border border-green-200 cursor-not-allowed" : "bg-[#003366] text-white hover:bg-blue-900"}`}>
                              {currentUserAcked ? "✓ คุณรับทราบแล้ว" : <><Check size={14} className="mr-1 shrink-0" /> กดเพื่อรับทราบ</>}
                            </button>
                          ) : (
                            <span className="text-[10px] md:text-[11px] text-gray-500 italic bg-gray-50 px-3 py-1.5 rounded-md border border-gray-100 inline-block w-full text-center xl:w-auto">ไม่ต้องกดรับทราบ</span>
                          )}
                        </div>
                        
                        {dbUsers && (
                          <button onClick={() => setAckModalDoc(docObj)} className="w-full xl:w-auto text-[10px] md:text-[11px] text-blue-700 hover:text-blue-900 font-bold underline bg-blue-50 hover:bg-blue-100 px-2 md:px-2.5 py-2 md:py-1.5 rounded-lg border border-blue-200 transition-colors text-center">
                            ตรวจสอบรับทราบ ({ackCount}/{totalCount})
                          </button>
                        )}
                      </div>
                    )}

                    {docObj.status === DOC_STATUS.RETURNED && docObj.createdBy === currentUser.id && (
                      <div className="mt-3 pt-3 border-t border-red-100">
                          <button onClick={() => openResubmitModal(docObj)} className="w-full text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg text-[10px] md:text-[11px] font-bold transition-colors flex items-center justify-center border border-blue-200">
                            <RefreshCw size={14} className="mr-1.5" /> แก้ไขและส่งเรื่องใหม่
                          </button>
                      </div>
                    )}

                    {(docObj.extraAttachments||[]).length>0 && <div className="mt-3 border-t pt-2 space-y-1">
                       <p className="text-xs font-bold text-amber-800">เอกสารแนบเพิ่มเติมภายหลังอนุมัติ (ไม่ใช่ไฟล์ลงนาม)</p>
                       {docObj.extraAttachments.map((f,i)=><a key={i} href={f.url} target="_blank" rel="noreferrer" className="block text-blue-600 underline text-xs">{f.name} — {f.addedByName||''}</a>)}
                    </div>}
                    {([DOC_STATUS.PUBLISHED,DOC_STATUS.COMPLETED].includes(docObj.status)) && (currentUser.role==="admin" || docObj.createdBy===currentUser.id) && <button className="text-xs text-blue-700 border rounded p-2 mt-2" onClick={()=>setExtraDoc(docObj)}>+ เพิ่มไฟล์ประกอบหลังอนุมัติ</button>}
                    {currentUser.role === "admin" && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2 justify-end">
                        <button onClick={() => openEditDocModal(docObj)} className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-[10px] md:text-[11px] font-bold transition-colors flex items-center border border-blue-200">
                          <Edit size={12} className="mr-1" /> แก้ไข
                        </button>
                        <button onClick={() => setDocToDelete(docObj.id)} className="text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg text-[10px] md:text-[11px] font-bold transition-colors flex items-center border border-red-200">
                          <Trash2 size={12} className="mr-1" /> ลบ
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan="2" className="text-center py-10 text-gray-500 font-medium">ไม่พบเอกสารในระบบ</td></tr>}
          </tbody>
        </table>
      </div>

      <PageNavigator page={page} setPage={setPage} total={filtered.length} pageSize={pageSize}/>
      {extraDoc && <div className="fixed inset-0 z-[150] bg-black/50 flex items-center justify-center p-4"><div className="bg-white p-5 rounded-xl w-full max-w-lg space-y-3">
        <h3 className="font-bold">แนบเอกสารประกอบหลังอนุมัติ</h3><p className="text-xs text-amber-800">ไม่แก้ PDF ที่ผู้อำนวยการลงนามแล้ว ไฟล์ใหม่นี้ไม่ถือว่าผ่านการลงนาม</p>
        <input className="w-full text-sm" type="file" multiple onChange={e=>setExtraFiles(Array.from(e.target.files||[]))}/>
        <textarea className="w-full border rounded p-2 text-sm" value={extraReason} onChange={e=>setExtraReason(e.target.value)} placeholder="เหตุผลที่เพิ่มไฟล์"/>
        <div className="flex gap-2"><button className="border p-2 rounded" disabled={extraBusy} onClick={()=>setExtraDoc(null)}>ยกเลิก</button><button className="bg-blue-800 text-white p-2 rounded disabled:opacity-50" disabled={extraBusy} onClick={saveExtra}>บันทึกไฟล์ประกอบ</button></div>
      </div></div>}
      {versionsDoc && <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4"><div className="bg-white rounded-xl p-5 max-w-lg w-full max-h-[80vh] overflow-y-auto space-y-3">
        <h3 className="font-bold">ประวัติไฟล์: {versionsDoc.subject}</h3>
        {(versionsDoc.fileVersions || [{version:1,files:versionsDoc.files||[]}]).map((v,i)=><div key={i} className="border rounded p-3">
          <p className="font-bold text-sm">ฉบับที่ {v.version} {v.version === versionsDoc.activeFileVersion && "(ล่าสุด)"}</p>
          {(v.files||[]).map((f,j)=><a key={j} href={f.url} target="_blank" rel="noreferrer" className="block text-blue-600 text-sm underline">{f.name}</a>)}
        </div>)}
        <button className="border rounded p-2" onClick={()=>setVersionsDoc(null)}>ปิด</button>
      </div></div>}
      {historyModalDoc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[95%] sm:max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-fade-in">
            <div className="p-3 sm:p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-base sm:text-lg text-[#003366] flex items-center"><History className="mr-2" size={20}/> ประวัติการดำเนินการ</h3>
              <button onClick={() => setHistoryModalDoc(null)} className="text-gray-400 hover:text-red-500 transition-colors p-1"><X size={20} /></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 bg-slate-50 custom-scrollbar">
               {(!historyModalDoc.history || historyModalDoc.history.length === 0) ? (
                  <p className="text-center text-sm text-gray-500 py-4">ไม่มีประวัติการดำเนินการบันทึกไว้สำหรับเอกสารนี้</p>
               ) : (
                  <div className="relative border-l-2 border-blue-200 ml-3 space-y-6">
                    {historyModalDoc.history.map((hist, idx) => (
                      <div key={idx} className="relative pl-6">
                        <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-sm"></div>
                        <p className="text-xs text-gray-400 font-medium">{formatDateTime(hist.timestamp)}</p>
                        <h4 className="font-bold text-sm text-gray-800 mt-0.5">{hist.action}</h4>
                        <p className="text-[11px] text-gray-600 mt-1"><span className="font-medium text-gray-700">โดย:</span> {hist.byName} {hist.role && `(${hist.role})`}</p>
                        {hist.detail && hist.detail !== "-" && (
                           <div className="bg-white border border-gray-200 p-2 rounded mt-1.5 text-xs text-gray-700 shadow-sm">{hist.detail}</div>
                        )}
                      </div>
                    ))}
                  </div>
               )}
            </div>
          </div>
        </div>
      )}

      {ackModalDoc && (
        (() => {
          const modalTargetUsers = getDocTargetUsers(ackModalDoc);
          const ackUsers = modalTargetUsers.filter(u => ackModalDoc.acknowledgedBy?.includes(u.id));
          const unackUsers = modalTargetUsers.filter(u => !ackModalDoc.acknowledgedBy?.includes(u.id));

          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-[95%] sm:max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-fade-in">
                <div className="p-3 sm:p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                  <h3 className="font-bold text-base sm:text-lg text-[#003366]">ตรวจสอบการรับทราบ</h3>
                  <button onClick={() => setAckModalDoc(null)} className="text-gray-400 hover:text-red-500 transition-colors p-1"><X size={20} /></button>
                </div>
                <div className="p-3 sm:p-4 border-b shrink-0 bg-white shadow-sm z-10">
                  <p className="font-bold text-sm sm:text-base text-gray-800 break-words">{ackModalDoc.subject}</p>
                  <p className="text-[11px] sm:text-xs text-gray-500 mt-1 break-words">ประเภท: {ackModalDoc.type} | จาก: {ackModalDoc.from}</p>
                  {ackModalDoc.assignedTo && <p className="text-[11px] sm:text-xs text-blue-600 mt-1 font-bold">มอบหมาย: {ackModalDoc.assignedTo}</p>}
                </div>
                <div className="p-4 sm:p-5 overflow-y-auto flex-1 bg-slate-50 space-y-4 sm:space-y-6 custom-scrollbar">
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm text-green-700 flex items-center mb-2"><CheckCircle size={16} className="mr-1.5 shrink-0"/> รับทราบแล้ว ({ackUsers.length})</h4>
                    <div className="bg-white border border-green-100 rounded-lg p-2 sm:p-3 space-y-2 shadow-sm">
                      {ackUsers.map(u => (
                        <div key={u.id} className="text-[11px] sm:text-xs flex flex-col sm:flex-row justify-between sm:items-center border-b border-gray-50 pb-2 last:border-0 last:pb-0 gap-1">
                          <span className="font-bold text-gray-800 break-words">{u.name}</span>
                          <span className="text-[9px] sm:text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded self-start sm:self-auto">{ROLES[(u.role||"teacher").toUpperCase()]?.name}</span>
                        </div>
                      ))}
                      {ackUsers.length === 0 && <p className="text-xs text-gray-400 text-center py-2">ยังไม่มีผู้กดรับทราบ</p>}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm text-red-600 flex items-center mb-2"><AlertCircle size={16} className="mr-1.5 shrink-0"/> ยังไม่รับทราบ ({unackUsers.length})</h4>
                    <div className="bg-white border border-red-100 rounded-lg p-2 sm:p-3 space-y-2 shadow-sm">
                      {unackUsers.map(u => (
                        <div key={u.id} className="text-[11px] sm:text-xs flex flex-col sm:flex-row justify-between sm:items-center border-b border-gray-50 pb-2 last:border-0 last:pb-0 gap-1">
                          <span className="text-gray-700 break-words">{u.name}</span>
                          <span className="text-[9px] sm:text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded self-start sm:self-auto">{ROLES[(u.role||"teacher").toUpperCase()]?.name}</span>
                        </div>
                      ))}
                      {unackUsers.length === 0 && <p className="text-xs text-green-600 font-bold text-center py-2">รับทราบครบทุกคนแล้ว 🎉</p>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {docToResubmit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[95%] sm:max-w-lg overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            <div className="p-3 sm:p-5 border-b bg-red-50 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-base sm:text-lg text-red-800">แก้ไขและส่งเรื่องใหม่</h3>
              <button onClick={() => setDocToResubmit(null)} className="text-gray-400 hover:text-red-500 transition-colors p-1"><X size={20} /></button>
            </div>
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              <div className="bg-white border border-red-200 p-3 rounded-lg shadow-sm">
                <span className="text-xs font-bold text-red-600 block mb-1">เหตุผลที่ส่งกลับแก้ไข:</span>
                <p className="text-sm text-gray-800">{docToResubmit.rejectReason || "-"}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">ชื่อเรื่องใหม่</label>
                <input type="text" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={resubmitForm.subject} onChange={(e) => setResubmitForm({ ...resubmitForm, subject: e.target.value })} />
              </div>
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                <label className="text-xs sm:text-sm font-bold text-gray-700 block mb-2">แนบไฟล์เพิ่มเติม (ไฟล์เดิมจะยังอยู่ครบ)</label>
                <label className="cursor-pointer text-xs sm:text-sm bg-white border border-gray-300 px-3 sm:px-4 py-2 rounded-lg inline-flex items-center hover:bg-gray-100 shadow-sm font-medium">
                  <FileUp size={16} className="mr-2 text-blue-600 shrink-0" /> เลือกไฟล์เพิ่ม
                  <input type="file" className="hidden" multiple onChange={(e) => setResubmitNewFiles(Array.from(e.target.files))} accept=".pdf,image/*" />
                </label>
                {resubmitNewFiles.map((f, i) => (
                  <div key={i} className="flex justify-between items-center text-[10px] md:text-xs bg-white border border-blue-200 mt-2 p-2 rounded shadow-sm">
                    <span className="text-blue-700 font-bold truncate pr-2">{f.name}</span>
                    <button onClick={() => setResubmitNewFiles(resubmitNewFiles.filter((_, idx) => idx !== i))} className="text-red-500 shrink-0"><X size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3 sm:p-5 border-t flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 bg-gray-50 shrink-0">
              <button onClick={() => setDocToResubmit(null)} disabled={isResubmitting} className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 border border-gray-300 text-gray-700 bg-white rounded-lg font-bold hover:bg-gray-100 transition-colors text-sm">ยกเลิก</button>
              <button onClick={handleResubmit} disabled={isResubmitting} className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md flex items-center justify-center transition-colors text-sm">
                {isResubmitting ? <><Loader2 className="animate-spin mr-2" size={16} /> {resubmitStatus}</> : <><RefreshCw size={16} className="mr-2" /> ส่งเข้ากระบวนการใหม่</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {docToDelete && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
           <div className="bg-white p-5 sm:p-6 rounded-xl shadow-xl w-full max-w-[95%] sm:max-w-sm text-center animate-fade-in">
             <AlertCircle size={40} className="mx-auto text-yellow-500 mb-3 sm:mb-4 sm:w-12 sm:h-12" />
             <h3 className="text-base sm:text-lg font-bold mb-2">ย้ายลงถังขยะ?</h3>
             <p className="text-xs sm:text-sm text-gray-500 mb-5 sm:mb-6">เอกสารนี้จะถูกซ่อนจากระบบ แต่สามารถกู้คืนได้ในเมนูถังขยะ</p>
             <div className="flex gap-2 sm:gap-3">
               <button onClick={() => setDocToDelete(null)} className="flex-1 px-3 sm:px-4 py-2 bg-gray-100 text-xs sm:text-sm font-bold rounded hover:bg-gray-200 transition-colors">ยกเลิก</button>
               <button onClick={executeDeleteDoc} className="flex-1 px-3 sm:px-4 py-2 bg-yellow-600 text-white text-xs sm:text-sm font-bold rounded hover:bg-yellow-700 transition-colors">ย้ายลงถังขยะ</button>
             </div>
           </div>
         </div>
      )}

      {docToEdit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[95%] sm:max-w-lg overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            <div className="p-3 sm:p-5 border-b bg-gray-50 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-base sm:text-lg text-[#003366]">แก้ไขข้อมูลเอกสาร</h3>
              <button onClick={() => setDocToEdit(null)} className="text-gray-400 hover:text-red-500 transition-colors p-1"><X size={20} /></button>
            </div>
            <div className="p-4 sm:p-5 space-y-3 sm:space-y-4 overflow-y-auto custom-scrollbar flex-1">
              <div className="md:col-span-2">
                <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">เรื่อง</label>
                <input type="text" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={editForm.subject} onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })} />
              </div>
              
              {["หนังสือเข้า", "คำสั่งโรงเรียน"].includes(editForm.type) && (
                <div>
                  <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">{editForm.type === "หนังสือเข้า" ? "เลขรับ" : "เลขที่คำสั่ง"}</label>
                  <input type="text" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={editForm.docNumber} onChange={(e) => setEditForm({ ...editForm, docNumber: e.target.value })} />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">วันที่</label>
                  <input type="date" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
                </div>
                {editForm.type === "หนังสือเข้า" && (
                  <div>
                    <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">ชั้นความเร็ว</label>
                    <select className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm" value={editForm.urgency} onChange={(e) => setEditForm({ ...editForm, urgency: e.target.value })}>
                       <option value="ปกติ">ปกติ</option>
                       <option value="ด่วน">ด่วน</option>
                       <option value="ด่วนมาก">ด่วนมาก</option>
                       <option value="ด่วนที่สุด">ด่วนที่สุด</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">ประเภทเอกสาร</label>
                <select className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm" value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}>
                  <option value="หนังสือเข้า">หนังสือเข้า</option>
                  <option value="คำสั่งโรงเรียน">คำสั่งโรงเรียน</option>
                  <option value="หนังสือเวียนแจ้งรับทราบ">หนังสือเวียนแจ้งรับทราบ</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">จาก (ผู้ส่ง)</label>
                <input type="text" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={editForm.from} onChange={(e) => setEditForm({ ...editForm, from: e.target.value })} />
              </div>
            </div>
            <div className="p-3 sm:p-5 border-t flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 bg-gray-50 shrink-0">
              <button onClick={() => setDocToEdit(null)} disabled={isSavingEdit} className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 border border-gray-300 text-gray-700 bg-white rounded-lg font-bold hover:bg-gray-100 transition-colors text-sm">ยกเลิก</button>
              <button onClick={handleSaveEditDoc} disabled={isSavingEdit} className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 bg-[#003366] hover:bg-blue-900 text-white rounded-lg font-bold shadow-md flex items-center justify-center transition-colors text-sm">
                {isSavingEdit ? <Loader2 className="animate-spin mr-2" size={16} /> : <Save size={16} className="mr-2" />} บันทึกข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormDocument({ docType, documents = [], changeMenu, backMenu, currentUser, systemSettings, showToast, orderReservations = [] }) {
  let defaultDept = "";
  if (currentUser.adminDept && currentUser.adminDept !== "-") defaultDept = currentUser.adminDept;
  else if (currentUser.subjectArea && currentUser.subjectArea !== "-" && currentUser.subjectArea !== "ไม่มีกลุ่มสาระการเรียนรู้") defaultDept = currentUser.subjectArea;

  const draftKey="bhs-edoc-draft-"+currentUser.id+"-"+docType;
  const [form, setForm] = useState(()=>{
    const blank={subject:"",docNumber:"",date:getTodayIso(),urgency:"ปกติ",from:currentUser.name,department:defaultDept};
    try{const saved=localStorage.getItem(draftKey);return saved?{...blank,...JSON.parse(saved)}:blank}catch{return blank;}
  });
  useEffect(()=>{try{localStorage.setItem(draftKey,JSON.stringify(form))}catch{}},[draftKey,form]);
  
  const [rawFiles, setRawFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [selectedReservation, setSelectedReservation] = useState("");
  const [createdSummary, setCreatedSummary] = useState(null);
  const availableReservations = orderReservations.filter(r =>
    (r.status === "reserved" || !r.status) && !r.linkedDocumentId && !r.trialArchived &&
    (r.createdBy === currentUser.id || currentUser.role === "admin")
  );
  const chosenReservation = availableReservations.find(r => r.id === selectedReservation);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting)return;
    if (!navigator.onLine)return showToast("ไม่มีอินเทอร์เน็ต กรุณาเชื่อมต่อก่อนบันทึก","error");
    if (!form.subject) return showToast("กรุณากรอกชื่อเรื่อง", "error");
    if (docType === "คำสั่งโรงเรียน" && !chosenReservation) return showToast("กรุณาเลือกเลขคำสั่งที่จองไว้ก่อน", "error");
    if (docType === "คำสั่งโรงเรียน" && !rawFiles.some(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))) return showToast("กรุณาแนบ PDF สำหรับเสนอ ผอ.ลงนาม", "error");
    const number=docType==="คำสั่งโรงเรียน"?chosenReservation?.orderNumber:form.docNumber;
    const possibleDup=documents.filter(d=>d.type===docType && !d.isDeleted && ((number&&d.docNumber===number)||(d.subject||"").trim().toLowerCase()===form.subject.trim().toLowerCase()));
    if(possibleDup.length&&!window.confirm("พบเอกสารที่มีเลขที่หรือชื่อเรื่องเหมือนกัน "+possibleDup.length+" รายการ\nคุณต้องการบันทึกต่อหรือไม่?"))return;
    if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.includes("script.google.com/macros/s/AKfycbwY4")) {
      return showToast("กรุณาตั้งค่า GAS_WEB_APP_URL ให้ถูกต้องในโค้ดก่อนใช้งาน", "error");
    }

    setIsSubmitting(true);
    setUploadStatus("เตรียมอัปโหลดไฟล์...");

    try {
      let uploadedFiles = [];
      if (rawFiles.length > 0) {
        uploadedFiles = await uploadMultipleFilesToDrive(rawFiles, setUploadStatus);
      }

      setUploadStatus("กำลังบันทึกข้อมูลลงฐานระบบ...");
      const newDocId = uniqueId("DOC");
      
      const newDoc = {
        subject: form.subject, 
        docNumber: docType === "คำสั่งโรงเรียน" ? chosenReservation.orderNumber : docType === "หนังสือเข้า" ? form.docNumber : "",
        reservationId: docType === "คำสั่งโรงเรียน" ? chosenReservation.id : null,
        date: form.date, 
        urgency: docType === "หนังสือเข้า" ? form.urgency : "ปกติ",
        type: docType, 
        department: docType === "หนังสือเข้า" ? "-" : form.department,
        from: form.from, 
        createdBy: currentUser.id, 
        files: uploadedFiles,
        fileVersions: [{ version: 1, files: uploadedFiles, timestamp: Date.now(), reason: "ฉบับแรก" }],
        activeFileVersion: 1,
        status: DOC_STATUS.WAITING_DEPUTY,
        acknowledgedBy: [], 
        createdAt: Date.now(),
        history: [{
          action: "ลงทะเบียนเอกสาร / สร้างเรื่อง",
          by: currentUser.id,
          byName: currentUser.name,
          role: ROLES[currentUser.role.toUpperCase()]?.name,
          timestamp: Date.now(),
          detail: "-"
        }]
      };

      if (docType === "คำสั่งโรงเรียน") {
        await runTransaction(db, async tx => {
          const resRef = getDocumentRef(ORDER_RESERVE_PATH, chosenReservation.id);
          const snapshot = await tx.get(resRef);
          if (!snapshot.exists() || snapshot.data().status === "canceled" || snapshot.data().trialArchived || snapshot.data().linkedDocumentId || snapshot.data().orderNumber !== chosenReservation.orderNumber)
            throw new Error("เลขจองเปลี่ยนหรือถูกใช้แล้ว กรุณาเลือกใหม่");
          tx.set(getDocumentRef(DOCS_PATH, newDocId), newDoc);
          tx.update(resRef, { status: "linked", linkedDocumentId: newDocId, linkedAt: Date.now() });
          tx.set(doc(getCollectionRef(AUDIT_LOG_PATH)), auditPayload(currentUser,"สร้างเอกสาร","DOCUMENT",newDocId,`${newDoc.docNumber}: ${form.subject}`));
        });
      } else {
        const batch = writeBatch(db);
        batch.set(getDocumentRef(DOCS_PATH, newDocId), newDoc);
        batch.set(doc(getCollectionRef(AUDIT_LOG_PATH)), auditPayload(currentUser,"สร้างเอกสาร","DOCUMENT",newDocId,`${docType}: ${form.subject}`));
        await batch.commit();
      }
      try{localStorage.removeItem(draftKey)}catch{}
      if (docType === "คำสั่งโรงเรียน") {
        setCreatedSummary({ number: newDoc.docNumber || "ไม่มีเลข", subject: newDoc.subject, status: "รอรองผู้อำนวยการ", id:newDocId });
      } else changeMenu(backMenu);
      showToast("สร้างเอกสารและอัปโหลดสำเร็จ", "success");
    } catch (err) {
      showToast("อัปโหลดไม่สำเร็จ: " + err.message, "error");
    }
    
    setIsSubmitting(false);
    setUploadStatus("");
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden w-full">
      {createdSummary && <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-xl p-6 space-y-3 text-center">
          <CheckCircle className="mx-auto text-green-600" size={40}/>
          <h3 className="font-bold text-lg">สร้างเอกสารสำเร็จ</h3>
          <p className="font-bold text-blue-800 text-2xl">{createdSummary.number}</p>
          <p>{createdSummary.subject}</p><p className="text-sm text-gray-500">{createdSummary.status}</p>
          <button className="bg-[#003366] text-white rounded-lg p-3 w-full" onClick={()=>changeMenu("mydocs")}>ไปหน้าเอกสารที่ดำเนินการ</button>
        </div>
      </div>}
      <div className="bg-[#003366] px-4 sm:px-6 py-4 flex items-center">
        <FileText className="text-[#D4AF37] mr-3 shrink-0" size={24} />
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-white truncate">ลงทะเบียน: {docType}</h2>
          <p className="text-[10px] sm:text-xs text-blue-200 truncate">กรอกข้อมูลและแนบไฟล์เพื่อดำเนินการ</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          
          <div className="md:col-span-2">
            <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">เรื่อง <span className="text-red-500">*</span></label>
            <input type="text" className="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
          </div>

          {docType === "หนังสือเข้า" && (
            <div className="md:col-span-2"><label className="block text-xs sm:text-sm font-bold mb-1.5">เลขรับ</label>
              <input className="w-full border p-2.5 rounded-lg text-sm" value={form.docNumber} onChange={e=>setForm({...form,docNumber:e.target.value})} required /></div>
          )}
          {docType === "คำสั่งโรงเรียน" && <div className="md:col-span-2">
            <label className="block text-sm font-bold mb-1.5">เลือกเลขคำสั่งที่จองไว้ *</label>
            <select className="w-full border p-2.5 rounded-lg text-sm" required value={selectedReservation} onChange={e=>{
              const reservation=availableReservations.find(r=>r.id===e.target.value);
              setSelectedReservation(e.target.value);
              if(reservation) setForm(f=>({...f,subject:reservation.subject,date:reservation.orderDate,department:reservation.responsibleDept||f.department}));
            }}>
              <option value="">-- เลือกเลขที่จองไว้ --</option>
              {availableReservations.map(r=><option key={r.id} value={r.id}>{r.orderNumber} — {r.subject}</option>)}
            </select>
            {availableReservations.length===0 && <p className="text-xs text-red-600 mt-1">ยังไม่มีเลขจองว่าง กรุณาจองในเมนูเลขคำสั่งโรงเรียนก่อน</p>}
          </div>}

          <div>
            <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">วันที่ <span className="text-red-500">*</span></label>
            <input type="date" className="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={form.date} disabled={docType === "คำสั่งโรงเรียน" && Boolean(chosenReservation)} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>

          {docType === "หนังสือเข้า" && (
             <div>
               <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">ชั้นความเร็ว <span className="text-red-500">*</span></label>
               <select className="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white" value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })} required>
                 <option value="ปกติ">ปกติ</option>
                 <option value="ด่วน">ด่วน</option>
                 <option value="ด่วนมาก">ด่วนมาก</option>
                 <option value="ด่วนที่สุด">ด่วนที่สุด</option>
               </select>
             </div>
          )}

          <div className={docType === "หนังสือเข้า" ? "md:col-span-2" : "md:col-span-1"}>
            <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">จาก (ผู้ส่ง) <span className="text-red-500">*</span></label>
            <input type="text" className="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} required />
          </div>

          {docType !== "หนังสือเข้า" && (
            <div className="md:col-span-2 border-t border-gray-100 pt-3">
               <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">กลุ่มงาน/กลุ่มสาระฯ เจ้าของเรื่อง <span className="text-red-500">*</span></label>
               <select className="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required>
                 <option value="">-- ระบุกลุ่มงาน/กลุ่มสาระฯ --</option>
                 <optgroup label="กลุ่มบริหารงาน">{systemSettings.adminDepts.map((d) => <option key={d} value={d}>{d}</option>)}</optgroup>
                 <optgroup label="กลุ่มสาระการเรียนรู้">{systemSettings.subjectAreas.filter(d => d !== "ไม่มีกลุ่มสาระการเรียนรู้").map((d) => <option key={d} value={d}>{d}</option>)}</optgroup>
               </select>
            </div>
          )}
        </div>

        <div className="border-2 border-dashed border-gray-300 p-4 sm:p-6 rounded-lg bg-gray-50 text-center hover:bg-gray-100 transition-colors">
          <FileIcon className="mx-auto h-8 w-8 sm:h-10 sm:w-10 text-gray-400 mb-2" />
          <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-2">อัปโหลดไฟล์แนบ</label>
          <label className="cursor-pointer text-xs sm:text-sm bg-white border border-blue-300 text-blue-600 px-3 sm:px-4 py-2 rounded-lg inline-block shadow-sm hover:bg-blue-50 font-medium">
            คลิกเลือกไฟล์
            <input type="file" multiple onChange={(e) => setRawFiles(Array.from(e.target.files))} accept=".pdf,image/*" className="hidden" />
          </label>
          {rawFiles.length > 0 && (
            <div className="mt-4 space-y-2 text-left">
              {rawFiles.map((f, i) => (
                <div key={i} className="text-[10px] sm:text-xs bg-white border border-gray-200 p-2 rounded shadow-sm flex items-center justify-between">
                  <span className="font-bold text-gray-700 truncate pr-2">{f.name}</span>
                  <span className="text-gray-400 shrink-0">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-4 sm:pt-5 border-t border-gray-100">
          <button type="button" onClick={() => changeMenu(backMenu)} disabled={isSubmitting} className="w-full sm:w-auto px-4 sm:px-5 py-2.5 border border-gray-300 text-gray-700 bg-white rounded-lg font-bold hover:bg-gray-50 text-sm">ยกเลิก</button>
          <button type="submit" disabled={isSubmitting} className="w-full sm:w-auto px-4 sm:px-5 py-2.5 bg-[#003366] text-white rounded-lg font-bold shadow-md hover:bg-blue-900 flex items-center justify-center text-sm">
            {isSubmitting ? <><Loader2 className="animate-spin mr-2" size={16} /> <span className="truncate">{uploadStatus}</span></> : <><Send size={16} className="mr-2" /> บันทึกและเสนอเรื่อง</>}
          </button>
        </div>
      </form>
    </div>
  );
}

function AdminRegisterNumberSettings({ currentUser, showToast }) {
  const [registerKind, setRegisterKind] = useState("ORDER");
  const [registerYear, setRegisterYear] = useState(String(new Date().getFullYear() + 543));
  const [nextNumberText, setNextNumberText] = useState("");
  const [counterInfo, setCounterInfo] = useState(null);
  const [highestInDatabase, setHighestInDatabase] = useState(0);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [savingNumber, setSavingNumber] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);

  const isAdmin = currentUser?.role === "admin";
  const selectedYear = Number(registerYear);
  const yearIsValid = /^\d{4}$/.test(registerYear) && selectedYear >= 2500 && selectedYear <= 2999;
  const counterId = `${registerKind}-${registerYear}`;
  const label = registerKind === "ORDER" ? "เลขคำสั่งโรงเรียน" : "เลขหนังสือออก";
  const sourceCollection = registerKind === "ORDER" ? ORDER_RESERVE_PATH : OUTGOING_RESERVE_PATH;
  const sourceField = registerKind === "ORDER" ? "orderNumber" : "docNumber";

  const sequenceForYear = (value, year) => {
    const match = /^(\d+)\/(\d{4})$/.exec(String(value || "").trim());
    if (!match || Number(match[2]) !== year) return 0;
    return Number(match[1]) || 0;
  };

  const highestFromDatabase=(reservations,documentRecords,year)=>{
    const occupied=occupiedRegisterNumbers(registerKind,reservations,documentRecords);
    let highest=0;
    for(const value of occupied){const n=parseRegisterNumber(value);if(n?.year===year)highest=Math.max(highest,n.sequence);}
    return highest;
  };

  const readRegisterState = async () => {
    if (!isAdmin || !yearIsValid) return;
    setLoadingInfo(true);
    try {
      const [counterSnap, reservationSnap, docsSnap, logsSnap] = await Promise.all([
        getDocFromServer(getDocumentRef(COUNTERS_PATH, counterId)),
        getDocsFromServer(getCollectionRef(sourceCollection)),
        getDocsFromServer(getCollectionRef(DOCS_PATH)),
        getDocs(query(getCollectionRef(AUDIT_LOG_PATH), orderBy("timestamp", "desc"), limit(100)))
      ]);
      const records = reservationSnap.docs.map(item => item.data());
      const documentRecords = docsSnap.docs.map(item => item.data());
      setHighestInDatabase(highestFromDatabase(records, documentRecords, selectedYear));
      setCounterInfo(counterSnap.exists() ? counterSnap.data() : null);
      setHistoryRows(logsSnap.docs.map(item => item.data()).filter(item =>
        item.targetType === "NUMBER_COUNTER" && item.targetId === counterId
      ));
    } catch (error) {
      showToast("โหลดข้อมูลทะเบียนไม่ได้: " + error.message, "error");
    } finally {
      setLoadingInfo(false);
    }
  };

  useEffect(() => {
    if (!isAdmin || !yearIsValid) return;
    let cancelled = false;
    setLoadingInfo(true);
    Promise.all([
      getDocFromServer(getDocumentRef(COUNTERS_PATH, counterId)),
      getDocsFromServer(getCollectionRef(sourceCollection)),
      getDocsFromServer(getCollectionRef(DOCS_PATH)),
      getDocs(query(getCollectionRef(AUDIT_LOG_PATH), orderBy("timestamp", "desc"), limit(100)))
    ]).then(([counterSnap, reservationSnap, docsSnap, logsSnap]) => {
      if (cancelled) return;
      setCounterInfo(counterSnap.exists() ? counterSnap.data() : null);
      setHighestInDatabase(highestFromDatabase(
        reservationSnap.docs.map(item => item.data()),
        docsSnap.docs.map(item => item.data()),
        selectedYear
      ));
      setHistoryRows(logsSnap.docs.map(item => item.data()).filter(item =>
        item.targetType === "NUMBER_COUNTER" && item.targetId === counterId
      ));
    }).catch(error => {
      if (!cancelled) showToast("โหลดข้อมูลทะเบียนไม่ได้: " + error.message, "error");
    }).finally(() => {
      if (!cancelled) setLoadingInfo(false);
    });
    return () => { cancelled = true; };
  }, [registerKind, registerYear, isAdmin]);

  const saveNextNumber = async () => {
    if (!isAdmin) return;
    if (!yearIsValid) return showToast("กรุณาระบุปี พ.ศ. ให้ถูกต้อง", "error");
    if (!/^[1-9]\d*$/.test(nextNumberText.trim()) ||
        !Number.isSafeInteger(Number(nextNumberText)) || Number(nextNumberText) > 999999999) {
      return showToast("กรุณาระบุเลขถัดไปเป็นจำนวนเต็มบวก", "error");
    }
    const next = Number(nextNumberText);
    if (!window.confirm(
      `ยืนยันให้${label}ที่จะออกถัดไปเป็น ${next}/${registerYear} ใช่หรือไม่?\n\n` +
      "ระบบจะตรวจเลขที่ยังใช้งานอยู่และข้ามเลขซ้ำโดยอัตโนมัติ; ไฟล์ PDF ที่ออกแล้วไม่เปลี่ยน"
    )) return;

    setSavingNumber(true);
    try {
      const counterRef = getDocumentRef(COUNTERS_PATH, counterId);
      // อ่านทะเบียนล่าสุด ก่อนทำธุรกรรม และอ่าน counter ซ้ำภายในธุรกรรม
      // การจองเลขปกติก็เขียน counter เดียวกัน จึงป้องกันการเขียนทับการจองพร้อมกันได้
      const beforeSnap=await getDocFromServer(counterRef);
      const previousNumber=beforeSnap.exists()?Number(beforeSnap.data().lastNumber)||0:0;
      const highest=highestInDatabase;
      const timestamp = Date.now();
      const auditRef = doc(getCollectionRef(AUDIT_LOG_PATH));
      await runTransaction(db, async tx => {
        const liveSnap = await tx.get(counterRef);
        const liveNumber = liveSnap.exists() ? Number(liveSnap.data().lastNumber) || 0 : 0;
        // ไม่อนุญาตให้การตั้งเลขใหม่ทับการจองที่เกิดขึ้นขณะบันทึก
        if (liveSnap.exists() !== beforeSnap.exists() ||
            registerCounterStamp(liveSnap.exists()?liveSnap.data():null)!==
            registerCounterStamp(beforeSnap.exists()?beforeSnap.data():null)) {
          throw new Error("มีผู้อื่นจองเลขหรือปรับเลขระหว่างบันทึก กรุณากดตรวจสอบใหม่");
        }
        tx.set(counterRef, {
          kind: registerKind,
          year: selectedYear,
          lastNumber: next - 1,
          revision: (Number(liveSnap.exists()?liveSnap.data().revision:0)||0)+1,
          manualSetAt: timestamp,
          manualSetBy: currentUser.id,
          updatedAt: timestamp
        }, { merge: true });
        tx.set(auditRef, auditPayload(
          currentUser, "แอดมินกำหนดเลขถัดไป", "NUMBER_COUNTER", counterId,
          `${label} ปี ${registerYear}: ${previousNumber + 1}/${registerYear} → ${next}/${registerYear}; ` +
          `เลขสูงสุดในรายการใช้งาน ${highest}/${registerYear}`
        ));
      });
      setCounterInfo(previous => ({ ...(previous || {}), lastNumber: next - 1, kind: registerKind, year: selectedYear }));
      setHighestInDatabase(highest);
      setHistoryRows(previous => [{
        ...auditPayload(currentUser, "แอดมินกำหนดเลขถัดไป", "NUMBER_COUNTER", counterId,
          `ตั้งเลขถัดไปเป็น ${next}/${registerYear}`),
      }, ...previous].slice(0, 100));
      setNextNumberText("");
      showToast(`ตั้งจุดเริ่มต้นที่ ${next}/${registerYear} แล้ว (ระบบจะข้ามเลขที่ยังใช้งานซ้ำ)`, "success");
    } catch (error) {
      showToast("ตั้งเลขถัดไปไม่สำเร็จ: " + error.message, "error");
    } finally {
      setSavingNumber(false);
    }
  };

  if (!isAdmin) return null;
  const consumed = Number(counterInfo?.lastNumber) || 0;
  const minAllowed = 1;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Hash size={20} /> กำหนดเลขหนังสือที่จะออกถัดไป</h3>
          <p className="text-xs text-gray-500 mt-1">เฉพาะแอดมิน • ตัวนับแยกกันระหว่างเลขคำสั่งกับหนังสือออก และแยกตามปี พ.ศ.</p>
        </div>
        <button type="button" className="text-sm border rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-50" onClick={readRegisterState} disabled={loadingInfo || savingNumber}>
          <RefreshCw size={15} className="inline-block mr-1" /> ตรวจสอบเลขล่าสุด
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <label className="block text-sm font-bold text-gray-700">ประเภททะเบียน
          <select value={registerKind} onChange={e => { setRegisterKind(e.target.value); setNextNumberText(""); }} className="w-full border border-gray-300 rounded-lg p-2.5 mt-1 bg-white">
            <option value="ORDER">ขอเลขคำสั่งโรงเรียน</option>
            <option value="OUT">ขอเลขหนังสือออก</option>
          </select>
        </label>
        <label className="block text-sm font-bold text-gray-700">ปี พ.ศ.
          <input type="number" min="2500" max="2999" step="1" value={registerYear} onChange={e => { setRegisterYear(e.target.value); setNextNumberText(""); }} className="w-full border border-gray-300 rounded-lg p-2.5 mt-1" />
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-50 border px-4 py-3"><p className="text-xs text-gray-500">ตำแหน่งตัวนับปัจจุบัน</p><p className="text-xl font-bold text-[#003366]">{loadingInfo ? "กำลังตรวจสอบ..." : `${consumed}/${registerYear}`}</p></div>
        <div className="rounded-lg bg-slate-50 border px-4 py-3"><p className="text-xs text-gray-500">เลขสูงสุดในรายการที่ยังใช้งาน</p><p className="text-xl font-bold text-[#003366]">{loadingInfo ? "กำลังตรวจสอบ..." : `${highestInDatabase}/${registerYear}`}</p></div>
      </div>
      <label className="block text-sm font-bold text-gray-700">เลขที่จะออกถัดไป ({label})
        <input type="number" min={minAllowed} step="1" value={nextNumberText} onChange={e => setNextNumberText(e.target.value)} placeholder={`เช่น ${minAllowed}`} className="w-full border border-gray-300 rounded-lg p-3 mt-1 text-lg font-bold" />
      </label>
      {nextNumberText && /^[1-9]\d*$/.test(nextNumberText) &&
        <p className="text-sm text-blue-900 bg-blue-50 rounded-lg p-3">การจองครั้งถัดไปจะได้: <strong>{nextNumberText}/{registerYear}</strong></p>}
      <p className="text-xs text-amber-800">แอดมินตั้งเลขถัดไปเป็นจำนวนเต็มบวกใดก็ได้ รวมถึงเลขต่ำกว่าเดิม • ระบบข้ามเลขซ้ำเฉพาะทะเบียนและเอกสารที่ยังแสดงอยู่ • เลขที่ลบ/ยกเลิก/จัดเก็บไว้ไม่ขวาง</p>
      <button type="button" onClick={saveNextNumber} disabled={!yearIsValid || !nextNumberText.trim() || savingNumber || loadingInfo} className="px-5 py-2.5 rounded-lg bg-[#003366] text-white font-bold hover:bg-blue-900 disabled:opacity-40 flex items-center gap-2">
        <Save size={18}/>{savingNumber ? "กำลังบันทึก..." : `ยืนยันตั้ง${label}ถัดไป`}
      </button>
      <details className="border rounded-lg p-3">
        <summary className="cursor-pointer text-sm font-bold">ประวัติการตั้งเลขของทะเบียนนี้ ({historyRows.length} รายการล่าสุดที่พบ)</summary>
        <div className="mt-2 max-h-48 overflow-y-auto divide-y text-xs">
          {historyRows.length === 0 && <p className="py-2 text-gray-500">ยังไม่พบประวัติการตั้งเลข</p>}
          {historyRows.map((item, index) => <p className="py-2" key={`${item.timestamp}-${index}`}>{formatDateTime(item.timestamp)} — {item.userName || "-"} — {item.detail || item.action}</p>)}
        </div>
      </details>
    </div>
  );
}

function SystemSettingsView({ systemSettings, showToast, currentUser, dbUsers }) {
  const [form, setForm] = useState(systemSettings);
  const [newDept, setNewDept] = useState("");
  const [newSubj, setNewSubj] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const addArrayItem = (field, value, setter) => {
    if (value.trim() && !form[field].includes(value.trim())) {
      setForm({ ...form, [field]: [...form[field], value.trim()] });
      setter("");
    }
  };

  const removeArrayItem = (field, value) => {
    setForm({ ...form, [field]: form[field].filter(d => d !== value) });
  };

  const handleSave = async () => {
    if (!form.schoolName || !form.schoolLogoText) return showToast("กรุณาระบุชื่อโรงเรียนและอักษรย่อ", "error");
    setIsSaving(true);
    try {
      await setDoc(getDocumentRef(SETTINGS_PATH, 'system'), form);
      writeAuditLog(currentUser, "แก้ไขการตั้งค่าระบบ", "SYSTEM", "settings", "อัปเดตข้อมูลโรงเรียน/กลุ่มงาน");
      showToast("บันทึกการตั้งค่าระบบเรียบร้อยแล้ว", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
    setIsSaving(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-800">ตั้งค่าระบบ (System Settings)</h2>
          <p className="text-xs md:text-sm text-gray-500 mt-1">ปรับแต่งข้อมูลพื้นฐานของโรงเรียนและโครงสร้างองค์กร</p>
        </div>
        <button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto px-6 py-2.5 bg-[#003366] hover:bg-blue-900 text-white rounded-lg font-bold shadow-md flex items-center justify-center transition-colors text-sm">
          {isSaving ? <Loader2 className="animate-spin mr-2" size={18} /> : <Save size={18} className="mr-2" />} บันทึกการตั้งค่า
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 md:p-6 space-y-5">
        <h3 className="font-bold text-lg text-gray-800 border-b pb-2">ข้อมูลโรงเรียน</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">ชื่อโรงเรียนเต็ม <span className="text-red-500">*</span></label>
            <input type="text" className="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">อักษรย่อ / โลโก้แบบย่อ <span className="text-red-500">*</span></label>
            <input type="text" className="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={form.schoolLogoText} onChange={(e) => setForm({ ...form, schoolLogoText: e.target.value })} placeholder="เช่น บ.ศ." />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">ปีการศึกษาปัจจุบัน</label>
            <input type="text" className="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">ปีงบประมาณปัจจุบัน</label>
            <input type="text" className="w-full border border-gray-300 p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={form.fiscalYear} onChange={(e) => setForm({ ...form, fiscalYear: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 md:p-6 flex flex-col h-[400px]">
          <h3 className="font-bold text-lg text-gray-800 border-b pb-2 mb-4">กลุ่มบริหารงาน (Admin Depts)</h3>
          <div className="flex gap-2 mb-4">
             <input type="text" placeholder="เพิ่มกลุ่มงานใหม่..." className="flex-1 border border-gray-300 p-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={newDept} onChange={(e) => setNewDept(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addArrayItem('adminDepts', newDept, setNewDept)} />
             <button onClick={() => addArrayItem('adminDepts', newDept, setNewDept)} className="bg-blue-100 text-blue-700 px-3 py-2 rounded-lg font-bold hover:bg-blue-200 transition-colors"><Plus size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar border border-gray-100 rounded-lg p-2 bg-slate-50 space-y-2">
             {form.adminDepts.map(d => (
                <div key={d} className="bg-white border p-2.5 rounded flex justify-between items-center shadow-sm text-sm">
                   <span className="font-medium text-gray-700">{d}</span>
                   <button onClick={() => removeArrayItem('adminDepts', d)} className="text-red-400 hover:text-red-600 bg-red-50 p-1 rounded transition-colors"><Trash2 size={16} /></button>
                </div>
             ))}
             {form.adminDepts.length === 0 && <p className="text-center text-xs text-gray-400 py-4">ไม่มีข้อมูล</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 md:p-6 flex flex-col h-[400px]">
          <h3 className="font-bold text-lg text-gray-800 border-b pb-2 mb-4">กลุ่มสาระการเรียนรู้ (Subject Areas)</h3>
          <div className="flex gap-2 mb-4">
             <input type="text" placeholder="เพิ่มกลุ่มสาระฯ..." className="flex-1 border border-gray-300 p-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={newSubj} onChange={(e) => setNewSubj(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addArrayItem('subjectAreas', newSubj, setNewSubj)} />
             <button onClick={() => addArrayItem('subjectAreas', newSubj, setNewSubj)} className="bg-green-100 text-green-700 px-3 py-2 rounded-lg font-bold hover:bg-green-200 transition-colors"><Plus size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar border border-gray-100 rounded-lg p-2 bg-slate-50 space-y-2">
             {form.subjectAreas.map(d => (
                <div key={d} className="bg-white border p-2.5 rounded flex justify-between items-center shadow-sm text-sm">
                   <span className="font-medium text-gray-700">{d}</span>
                   <button onClick={() => removeArrayItem('subjectAreas', d)} className="text-red-400 hover:text-red-600 bg-red-50 p-1 rounded transition-colors"><Trash2 size={16} /></button>
                </div>
             ))}
             {form.subjectAreas.length === 0 && <p className="text-center text-xs text-gray-400 py-4">ไม่มีข้อมูล</p>}
          </div>
        </div>
      </div>
      <OrgHeads form={form} setForm={setForm} dbUsers={dbUsers}/>
      {currentUser.role==="admin"&&<AdminRegisterNumberSettings currentUser={currentUser} showToast={showToast}/>}
    </div>
  );
}

function UserManagementView({ dbUsers, documents, systemSettings, showToast, currentUser }) {
  const [modalMode, setModalMode] = useState(null); 
  const [isSaving, setIsSaving] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [formData, setFormData] = useState({ id: "", name: "", username: "", password: "", role: "teacher", adminDept: systemSettings.adminDepts[0] || "", subjectArea: systemSettings.subjectAreas[0] || "", status: "active" });

  const [backupBusy, setBackupBusy] = useState(false);
  // Opt-in local browser storage only; never save the secret to GitHub or Firebase.
  const [backupSecret,setBackupSecret] = useState(()=>loadSavedBackupSecret(localStorage,currentUser.id));
  const [rememberBackupSecret,setRememberBackupSecret] = useState(()=>!!loadSavedBackupSecret(localStorage,currentUser.id));
  const [hasSavedBackupSecret,setHasSavedBackupSecret] = useState(()=>!!loadSavedBackupSecret(localStorage,currentUser.id));
  const [backupStatus, setBackupStatus] = useState("");
  const [backupReport, setBackupReport] = useState(null);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoreMode,setRestoreMode]=useState("selected");
  const [restoreSelected,setRestoreSelected]=useState("");
  const [restorePreview,setRestorePreview]=useState(null);
  const [preBackupReady,setPreBackupReady]=useState(false);
  const handleBackup = async () => {
    if(!backupSecret.trim())return showToast("กรุณาระบุรหัสสำรองข้อมูล Google Drive ที่ตั้งไว้ใน Apps Script ก่อน","error");
    setBackupReport(null);
    setBackupBusy(true);
    try {
      const {blob,summary}=await createFullBackup({db,getCollectionRef,appId,onStatus:setBackupStatus,
        gasUrl:GAS_WEB_APP_URL,backupSecret:backupSecret.trim()});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;
      a.download=`BHS-${summary.complete?"FULL":"PARTIAL"}-BACKUP-${getTodayIso()}.zip`;a.click();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      setBackupReport(summary);
      if(rememberBackupSecret){
        if(saveBackupSecret(localStorage,currentUser.id,backupSecret))setHasSavedBackupSecret(true);
        else showToast("สำรองไฟล์ได้ แต่เบราว์เซอร์ไม่อนุญาตให้จำรหัส โปรดกรอกใหม่ครั้งหน้า","error");
      }
      if(summary.complete) {
        showToast("สร้าง ZIP สำรองครบแล้ว กรุณาตรวจไฟล์ที่ดาวน์โหลด","success");
        writeAuditLog(currentUser,"สำรองข้อมูลครบชุด","SYSTEM","backup","JSON และไฟล์แนบ");
      } else {
        showToast(`ได้ ZIP สำรองบางส่วน: ไฟล์ Drive ขาด ${summary.missingFiles.length}/${summary.expectedFiles} ไฟล์ ตรวจ MISSING-DRIVE-FILES.json`,"error");
        writeAuditLog(currentUser,"สำรองข้อมูลบางส่วน","SYSTEM","backup",
          `ไฟล์ Drive ขาด ${summary.missingFiles.length}/${summary.expectedFiles} ไฟล์`);
      }
    } catch(e){showToast("สำรองข้อมูลไม่สำเร็จ: "+e.message,"error");}
    finally{
      setBackupBusy(false);setBackupStatus("");
      if(!rememberBackupSecret)setBackupSecret("");
    }
  };
  const clearRememberedBackupSecret=()=>{
    forgetBackupSecret(localStorage,currentUser.id);
    setHasSavedBackupSecret(false);
    setRememberBackupSecret(false);
    setBackupSecret("");
    showToast("ลบรหัสสำรองข้อมูลที่จำไว้ในเบราว์เซอร์นี้แล้ว","success");
  };
  const handleInspect=async()=>{
    if(!restoreFile)return;
    setBackupBusy(true);try{setRestorePreview(await inspectFullBackup({zipFile:restoreFile,getCollectionRef,onStatus:setBackupStatus}));}
    catch(e){showToast(e.message,"error");setRestorePreview(null)}finally{setBackupBusy(false);setBackupStatus("")}
  };
  const handleRestore = async () => {
    if(!restoreFile||!restorePreview||restoreConfirm!=="RESTORE")return showToast("ต้องตรวจสอบ Backup และพิมพ์ RESTORE ก่อน","error");
    if(restoreMode==="replace"&&!preBackupReady)return showToast("ต้องดาวน์โหลดสำเนาข้อมูลปัจจุบันและยืนยันก่อน","error");
    setBackupBusy(true);
    try {
      await restoreFullBackup({db,getCollectionRef,zipFile:restoreFile,gasUrl:GAS_WEB_APP_URL,
        mode:restoreMode,selected:restoreSelected.split(/\n/).map(x=>x.trim()).filter(Boolean),onStatus:setBackupStatus});
      showToast("กู้คืนข้อมูลสำเร็จ กรุณาโหลดหน้าใหม่","success");
      setRestoreFile(null);setRestoreConfirm("");setRestorePreview(null);setPreBackupReady(false);
    } catch(e){showToast("การกู้คืนมีข้อผิดพลาด: "+e.message,"error");}
    finally{setBackupBusy(false);setBackupStatus("");}
  };

  const openAddModal = () => {
    setFormData({ id: "", name: "", username: "", password: "", role: "teacher", adminDept: systemSettings.adminDepts[0] || "", subjectArea: systemSettings.subjectAreas[0] || "", status: "active" });
    setModalMode('add');
  };

  const openEditModal = (user) => {
    setFormData({ ...user, password: user.password || "" });
    setModalMode('edit');
  };

  const toggleStatus = async (user) => {
    const newStatus = user.status === "inactive" ? "active" : "inactive";
    try {
      await updateDoc(getDocumentRef(USERS_PATH, user.id), { status: newStatus });
      writeAuditLog(currentUser, newStatus === "active" ? "เปิดใช้งานผู้ใช้" : "ปิดใช้งานผู้ใช้", "USER", user.id, `ผู้ใช้: ${user.name}`);
      showToast(`เปลี่ยนสถานะบัญชี ${user.name} เป็น ${newStatus} แล้ว`, "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleSaveUser = async () => {
    if (!formData.name || !formData.username) return showToast("กรอกข้อมูลให้ครบถ้วน", "error");

    const isDuplicate = dbUsers.some(u => u.username === formData.username.trim() && u.id !== formData.id);
    if (isDuplicate) {
      return showToast("Username นี้มีผู้ใช้งานแล้ว กรุณาระบุชื่ออื่น", "error");
    }

    setIsSaving(true);
    try {
      const userProfile = { ...formData, username: formData.username.trim() }; 
      
      if (userProfile.role === "director" || userProfile.role === "deputy") {
        userProfile.adminDept = "-"; 
        userProfile.subjectArea = "-";
      }

      if (modalMode === 'add') {
        userProfile.id = `U${Date.now()}`;
        if (!userProfile.password) userProfile.password = "123456";
        await setDoc(getDocumentRef(USERS_PATH, userProfile.id), userProfile);
        writeAuditLog(currentUser, "เพิ่มผู้ใช้", "USER", userProfile.id, `ชื่อ: ${userProfile.name}, Username: ${userProfile.username}`);
        showToast("เพิ่มผู้ใช้สำเร็จ", "success");
      } else if (modalMode === 'edit') {
        await updateDoc(getDocumentRef(USERS_PATH, userProfile.id), userProfile);
        writeAuditLog(currentUser, "แก้ไขผู้ใช้", "USER", userProfile.id, `แก้ไขข้อมูลของ: ${userProfile.name}`);
        showToast("แก้ไขข้อมูลผู้ใช้สำเร็จ", "success");
      }
      
      setModalMode(null);
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
    setIsSaving(false);
  };

  const executeDelete = async () => {
    if(!userToDelete) return;
    try {
      await deleteDoc(getDocumentRef(USERS_PATH, userToDelete));
      writeAuditLog(currentUser, "ลบผู้ใช้", "USER", userToDelete, "ลบบัญชีออกจากระบบถาวร");
      showToast("ลบผู้ใช้สำเร็จ", "success");
    } catch(err) {
      showToast("ลบไม่สำเร็จ: " + err.message, "error");
    }
    setUserToDelete(null);
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-800">จัดการผู้ใช้งานระบบ</h2>
        </div>
        <div className="w-full sm:w-auto flex flex-wrap gap-2">
           <div className="w-full sm:w-64 space-y-2">
             <label className="block text-xs text-slate-600 font-semibold">
               รหัสสำรองข้อมูล Drive
               <input type="password" autoComplete="off" value={backupSecret} onChange={e=>setBackupSecret(e.target.value)} placeholder={hasSavedBackupSecret?"มีรหัสที่จำไว้แล้ว":"จาก Apps Script"} aria-label="รหัสสำรองข้อมูล Google Drive" className="mt-1 w-full border border-gray-300 rounded-lg bg-white px-3 py-2.5 text-sm" />
             </label>
             <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
               <input type="checkbox" className="mt-0.5" checked={rememberBackupSecret} disabled={backupBusy}
                 onChange={e=>{
                   const checked=e.target.checked;
                   setRememberBackupSecret(checked);
                   if(!checked){
                     forgetBackupSecret(localStorage,currentUser.id);
                     setHasSavedBackupSecret(false);
                   }
                 }}/>
               <span>จำรหัสบนเบราว์เซอร์นี้ (ใช้เฉพาะเครื่องส่วนตัว)</span>
             </label>
             {hasSavedBackupSecret&&<button type="button" disabled={backupBusy} onClick={clearRememberedBackupSecret} className="text-xs text-red-700 underline underline-offset-2">ลบรหัสที่จำไว้</button>}
             <p className="text-[11px] leading-relaxed text-amber-700">รหัสที่จำไว้เก็บในเบราว์เซอร์เครื่องนี้แบบไม่เข้ารหัส ห้ามเลือกบนเครื่องใช้ร่วมกัน</p>
           </div>
           <button disabled={backupBusy} onClick={handleBackup} className="w-full sm:w-auto flex items-center justify-center bg-gray-100 text-gray-700 border border-gray-300 px-4 py-2.5 rounded-lg font-bold shadow-sm hover:bg-gray-200 transition-colors">
             <Database size={18} className="mr-2" /> สำรองข้อมูล (Backup)
           </button>
           <button onClick={openAddModal} className="w-full sm:w-auto flex items-center justify-center bg-[#003366] text-white px-4 py-2.5 rounded-lg font-bold shadow-md hover:bg-blue-900 transition-colors">
             <UserPlus size={18} className="mr-2" /> เพิ่มผู้ใช้
           </button>
        </div>
      </div>

      {backupReport&&<div className={"rounded-xl border p-4 text-sm space-y-2 "+(backupReport.complete?"border-green-200 bg-green-50 text-green-900":"border-amber-300 bg-amber-50 text-amber-900")}>
        <b>{backupReport.complete?"สร้างไฟล์ ZIP สำรองครบตามรายการอ้างอิง":"สร้างไฟล์ ZIP สำรองบางส่วน (ยังไม่ใช่ข้อมูลสำรองที่กู้คืนได้ครบ)"}</b>
        <p>ไฟล์แนบที่สำรองได้ {backupReport.archivedFiles}/{backupReport.expectedFiles} ไฟล์ — ตรวจ ZIP ที่ดาวน์โหลด</p>
        {!backupReport.complete&&<>
          <p>ไฟล์ที่ขาด {backupReport.missingFiles.length} รายการ เก็บรายชื่อและเอกสารที่อ้างอิงไว้ใน MISSING-DRIVE-FILES.json</p>
          <div className="max-h-32 overflow-y-auto">{backupReport.missingFiles.map(f=><p key={f.driveId}>• {f.name}</p>)}</div>
          <p className="font-semibold">ห้ามใช้ ZIP นี้เป็นจุดกู้คืนระบบเต็มรูปแบบ</p>
        </>}
      </div>}

      <div className="bg-white border border-amber-200 rounded-xl shadow-sm p-4 space-y-3">
        <h3 className="font-bold text-amber-900">กู้คืนข้อมูลจาก ZIP (แอดมิน)</h3>
        <p className="text-xs text-amber-800">ควรทดลองกับฐานข้อมูลทดสอบก่อนเสมอ การกู้คืน Firestore + Google Drive ไม่เป็นธุรกรรมเดียวกัน และการย้อนทั้งระบบต้องหยุดผู้ใช้งานระบบชั่วคราว</p>
        <input type="file" accept=".zip" onChange={e=>{setRestoreFile(e.target.files?.[0]||null);setRestorePreview(null);setPreBackupReady(false)}}/>
        <button className="border rounded p-2 text-xs" onClick={handleInspect} disabled={!restoreFile||backupBusy}>1. ตรวจสอบความต่างของข้อมูล</button>
        {restorePreview&&<div className="bg-slate-50 p-3 rounded text-xs space-y-2"><p>ชุดสำรองวันที่ {restorePreview.createdAt}; ไฟล์แนบ {restorePreview.fileCount} ไฟล์</p>
          {restorePreview.incomplete&&<p className="text-red-700 font-bold">คำเตือน: ชุดสำรองนี้ขาดไฟล์ Drive {restorePreview.missingFiles.length} รายการ ไม่สามารถกู้คืนอัตโนมัติได้</p>}
          <div className="max-h-52 overflow-y-auto">{restorePreview.details.map(d=><p key={d.name}>{d.name}: สำรอง {d.saved} / ปัจจุบัน {d.current} / ใหม่ในปัจจุบัน {d.onlyInCurrent} / เปลี่ยนแปลง {d.changed}</p>)}</div></div>}
        <select className="border rounded p-2 block text-sm" value={restoreMode} onChange={e=>{setRestoreMode(e.target.value);setPreBackupReady(false)}}>
          <option value="selected">เฉพาะรายการที่ระบุ</option>
          <option value="merge">รวม/เขียนทับรายการรหัสตรงกัน</option>
          <option value="replace">ย้อนข้อมูลทั้งชุด (จัดการรายการส่วนเกิน)</option>
        </select>
        {restoreMode==="selected"&&<textarea className="border rounded p-2 text-xs w-full" rows={3} value={restoreSelected} onChange={e=>setRestoreSelected(e.target.value)} placeholder="หนึ่งบรรทัดต่อรายการ เช่น bhs_documents:DOC-ID"/>}
        {restoreMode==="replace"&&<div className="bg-red-50 p-3 text-xs text-red-800 space-y-2"><b>การย้อนทั้งชุดลบรายการใน Firestore ที่ไม่มีใน ZIP และอาจเสียข้อมูลใหม่</b>
          <p>ก่อนดำเนินการให้หยุดการเขียนข้อมูลของผู้ใช้ทุกคนและเก็บ ZIP ปัจจุบันไว้จริง</p>
          <button disabled={backupBusy} onClick={async()=>{await handleBackup();setPreBackupReady(false)}} className="border rounded p-2">2. ดาวน์โหลด Backup ปัจจุบัน</button>
          <label className="flex gap-2"><input type="checkbox" checked={preBackupReady} onChange={e=>setPreBackupReady(e.target.checked)}/> ยืนยันว่าดาวน์โหลดและเก็บไฟล์ Backup ปัจจุบันไว้แล้ว</label></div>}
        <input className="border rounded p-2 text-xs block" placeholder="พิมพ์ RESTORE เพื่อยืนยัน" value={restoreConfirm} onChange={e=>setRestoreConfirm(e.target.value)}/>
        <button disabled={backupBusy||!restorePreview||restorePreview.incomplete||restoreConfirm!=="RESTORE"||(restoreMode==="replace"&&!preBackupReady)} onClick={handleRestore} className="bg-amber-700 text-white p-2 rounded text-sm disabled:opacity-40">เริ่มกู้คืนตามรูปแบบที่เลือก</button>
        {backupBusy&&<p className="text-blue-700 text-xs">{backupStatus||"กำลังดำเนินการ..."}</p>}
      </div>
      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden w-full">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-blue-50 text-gray-700 font-bold border-b">
              <tr>
                <th className="px-4 md:px-6 py-3 md:py-4 min-w-[150px]">ชื่อ - Username</th>
                <th className="px-4 md:px-6 py-3 md:py-4 min-w-[200px]">สิทธิ์ / กลุ่มงาน</th>
                <th className="px-4 md:px-6 py-3 md:py-4 min-w-[120px] text-center">สถานะ</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dbUsers.map((u) => (
                <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${u.status === 'inactive' ? 'opacity-60' : ''}`}>
                  <td className="px-4 md:px-6 py-4">
                    <div className="font-bold text-gray-900 text-sm md:text-base break-words">{u.name}</div>
                    <RoleIndicators user={u} settings={systemSettings} compact/>
                    <div className="text-[11px] md:text-xs text-gray-500 mt-0.5 break-words">Username: {u.username}</div>
                    {u.password && u.password !== "123456" && (
                      <div className="text-[9px] md:text-[10px] font-medium text-[#D4AF37] mt-1 bg-yellow-50 px-2 py-0.5 rounded inline-block border border-yellow-100">
                        รหัสผ่านถูกอัปเดตแล้ว
                      </div>
                    )}
                  </td>
                  <td className="px-4 md:px-6 py-4">
                    <span className="font-bold text-[11px] md:text-sm text-blue-700 block mb-1.5">{ROLES[(u.role||"teacher").toUpperCase()]?.name}</span>
                    {u.adminDept !== "-" && <div className="text-[10px] md:text-[11px] text-gray-500"><span className="font-medium text-gray-700">บริหาร:</span> <span className="break-words">{u.adminDept}</span></div>}
                    {u.subjectArea !== "-" && <div className="text-[10px] md:text-[11px] text-gray-500"><span className="font-medium text-gray-700">สาระฯ:</span> <span className="break-words">{u.subjectArea}</span></div>}
                  </td>
                  <td className="px-4 md:px-6 py-4 text-center">
                     <button onClick={() => toggleStatus(u)} className={`px-2 py-1 rounded text-[10px] md:text-xs font-bold border transition-colors ${u.status === 'inactive' ? 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200' : 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'}`}>
                       {u.status === 'inactive' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                     </button>
                  </td>
                  <td className="px-4 md:px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1 md:gap-2">
                      <button onClick={() => openEditModal(u)} className="text-blue-500 hover:bg-blue-50 p-1.5 md:p-2 rounded transition-colors" title="แก้ไขข้อมูล">
                        <Edit size={16} className="md:w-5 md:h-5" />
                      </button>
                      <button onClick={() => setUserToDelete(u.id)} className="text-red-500 hover:bg-red-50 p-1.5 md:p-2 rounded transition-colors" title="ลบผู้ใช้งาน">
                        <Trash2 size={16} className="md:w-5 md:h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {userToDelete && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
           <div className="bg-white p-5 sm:p-6 rounded-xl shadow-xl w-full max-w-[95%] sm:max-w-sm text-center animate-fade-in">
             <AlertCircle size={40} className="mx-auto text-red-500 mb-3 sm:mb-4 sm:w-12 sm:h-12" />
             <h3 className="text-base sm:text-lg font-bold mb-2">ยืนยันการลบผู้ใช้งาน?</h3>
             <p className="text-xs sm:text-sm text-gray-500 mb-5 sm:mb-6">หากลบแล้วจะไม่สามารถกู้คืนข้อมูลนี้ได้</p>
             <div className="flex gap-2 sm:gap-3">
               <button onClick={() => setUserToDelete(null)} className="flex-1 px-3 sm:px-4 py-2 bg-gray-100 text-xs sm:text-sm font-bold rounded hover:bg-gray-200 transition-colors">ยกเลิก</button>
               <button onClick={executeDelete} className="flex-1 px-3 sm:px-4 py-2 bg-red-600 text-white text-xs sm:text-sm font-bold rounded hover:bg-red-700 transition-colors">ลบข้อมูล</button>
             </div>
           </div>
         </div>
      )}

      {modalMode && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-[95%] sm:max-w-lg overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            <div className="p-3 sm:p-5 border-b bg-gray-50 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-base sm:text-lg text-[#003366]">{modalMode === 'add' ? 'เพิ่มผู้ใช้งานใหม่' : 'แก้ไขข้อมูลผู้ใช้งาน'}</h3>
              <button onClick={() => setModalMode(null)} className="text-gray-400 hover:text-red-500 transition-colors p-1"><X size={20} /></button>
            </div>
            
            <div className="p-4 sm:p-5 space-y-3 sm:space-y-4 overflow-y-auto custom-scrollbar flex-1">
              <div>
                <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">ชื่อ - นามสกุล <span className="text-red-500">*</span></label>
                <input type="text" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="เช่น นายสมชาย ใจดี" />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">Username <span className="text-red-500">*</span></label>
                  <input type="text" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="เช่น teacher1" />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">รหัสผ่านใหม่</label>
                  <input type="text" className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder={modalMode === 'add' ? "เว้นไว้เพื่อใช้ 123456" : "ตั้งรหัสผ่านใหม่"} />
                </div>
              </div>
              
              <div>
                <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">สิทธิ์การใช้งาน <span className="text-red-500">*</span></label>
                <select className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                  {Object.values(ROLES).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              
              {["teacher", "clerk", "admin"].includes(formData.role) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-3 border-t border-gray-100">
                  <div>
                    <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">กลุ่มบริหารงาน</label>
                    <select className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm" value={formData.adminDept} onChange={(e) => setFormData({ ...formData, adminDept: e.target.value })}>{systemSettings.adminDepts.map((d) => <option key={d}>{d}</option>)}</select>
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-bold mb-1.5 text-gray-700">กลุ่มสาระฯ</label>
                    <select className="w-full border border-gray-300 p-2 sm:p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm" value={formData.subjectArea} onChange={(e) => setFormData({ ...formData, subjectArea: e.target.value })}>{systemSettings.subjectAreas.map((d) => <option key={d}>{d}</option>)}</select>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-3 sm:p-5 border-t flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 bg-gray-50 shrink-0">
              <button onClick={() => setModalMode(null)} disabled={isSaving} className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 border border-gray-300 text-gray-700 bg-white rounded-lg font-bold hover:bg-gray-100 transition-colors text-sm">ยกเลิก</button>
              <button onClick={handleSaveUser} disabled={isSaving} className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 bg-[#003366] hover:bg-blue-900 text-white rounded-lg font-bold shadow-md flex items-center justify-center transition-colors text-sm">
                {isSaving ? <Loader2 className="animate-spin mr-2" size={16} /> : <Save size={16} className="mr-2" />} บันทึกข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditLogView({ currentUser, showToast }) {
  const [logs, setLogs] = useState([]);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(getCollectionRef(AUDIT_LOG_PATH), (snap) => {
      const data = snap.docs.map(d => ({id: d.id, ...d.data()}));
      data.sort((a,b) => b.timestamp - a.timestamp);
      setLogs(data);
      setLoading(false);
    }, (err) => {
      showToast("ไม่สามารถโหลด Audit Log ได้: " + err.message, "error");
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const actionTypes = [...new Set(logs.map(l => l.action))].sort();

  const filteredLogs = logs.filter(log => {
    if (filterDate) {
      const logDate = new Date(log.timestamp);
      const logIso = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`;
      if (logIso !== filterDate) return false;
    }
    if (filterAction && log.action !== filterAction) return false;
    if (search) {
      const searchStr = search.toLowerCase();
      return (log.userName?.toLowerCase().includes(searchStr) || 
              log.action?.toLowerCase().includes(searchStr) || 
              log.detail?.toLowerCase().includes(searchStr));
    }
    return true;
  });

  useEffect(()=>setPage(1),[search,filterDate,filterAction,pageSize]);
  const displayedLogs = filteredLogs.slice((page-1)*pageSize,page*pageSize);

  const getActionColor = (action) => {
    if (action.includes("เข้าสู่ระบบ") || action.includes("สำเร็จ")) return "text-green-600 bg-green-50";
    if (action.includes("ออกจากระบบ")) return "text-gray-600 bg-gray-100";
    if (action.includes("ลบ") || action.includes("ปิดใช้งาน") || action.includes("ส่งกลับ")) return "text-red-600 bg-red-50";
    if (action.includes("สร้าง") || action.includes("เพิ่ม") || action.includes("จอง") || action.includes("ขอเลข")) return "text-blue-600 bg-blue-50";
    if (action.includes("แก้ไข")) return "text-orange-600 bg-orange-50";
    return "text-gray-700 bg-gray-50 border-gray-200";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center">
            <ClipboardList className="mr-2 text-[#003366]" size={28} /> Audit Log (ประวัติกิจกรรม)
          </h2>
          <p className="text-xs md:text-sm text-gray-500 mt-1">ตรวจสอบการใช้งานและกิจกรรมต่างๆ ภายในระบบ (เฉพาะผู้ดูแลระบบ)</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden w-full">
        <div className="p-4 border-b bg-gray-50 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input type="text" placeholder="ค้นหาชื่อผู้ใช้, รายละเอียด..." className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
             <input type="date" className="w-full border border-gray-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} title="เลือกวันที่" />
          </div>
          <div>
            <select className="w-full border border-gray-300 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
               <option value="">-- กิจกรรมทั้งหมด --</option>
               {actionTypes.map(act => <option key={act} value={act}>{act}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2 text-sm text-gray-600 font-bold">
             แสดง:
             <select className="border border-gray-300 rounded-lg p-1.5 outline-none bg-white shadow-sm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
               <option value={50}>50</option>
               <option value={100}>100</option>
               <option value={200}>200</option>
             </select>
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="min-w-full text-left text-sm text-gray-600">
            <thead className="bg-[#003366] text-white text-[11px] md:text-xs uppercase font-bold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3.5 w-32">วัน - เวลา</th>
                <th className="px-4 py-3.5 w-48">ผู้ดำเนินการ</th>
                <th className="px-4 py-3.5 w-40">กิจกรรม (Action)</th>
                <th className="px-4 py-3.5 w-32">ประเภท</th>
                <th className="px-4 py-3.5 min-w-[200px]">รายละเอียด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white text-[11px] md:text-xs">
              {loading ? (
                <tr><td colSpan="5" className="text-center py-10"><Loader2 className="animate-spin text-blue-500 mx-auto" size={32} /></td></tr>
              ) : displayedLogs.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-10 text-gray-500 font-medium">ไม่พบข้อมูล Audit Log</td></tr>
              ) : (
                displayedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-700">{formatDateTime(log.timestamp)}</td>
                    <td className="px-4 py-3">
                       <span className="font-bold text-blue-800 break-words block">{log.userName}</span>
                       <span className="text-[10px] text-gray-500">{ROLES[log.role?.toUpperCase()]?.name || log.role}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                       <span className={`px-2 py-1 rounded border font-bold ${getActionColor(log.action)}`}>{log.action}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-bold whitespace-nowrap">{log.targetType}</td>
                    <td className="px-4 py-3 text-gray-600 break-words whitespace-normal min-w-[200px]">
                       {log.detail || "-"} 
                       {log.targetId && log.targetType !== 'SYSTEM' && <span className="block mt-1 text-[9px] text-gray-400">ID: {log.targetId}</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && <PageNavigator page={page} setPage={setPage} total={filteredLogs.length} pageSize={pageSize}/>}
      </div>
    </div>
  );
}
