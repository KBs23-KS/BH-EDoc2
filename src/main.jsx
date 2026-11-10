import React from 'react';
import { createRoot } from 'react-dom/client';
import App, {MainLayout, DEFAULT_SETTINGS} from './App';
import './style.css';

// CI-only fixture to exercise the AUTHENTICATED layout with real React hooks,
// without logging in, using school credentials, or touching Firestore.
// Vite removes this path from ordinary Preview / Production builds.
const smoke = import.meta.env.VITE_BHS_BROWSER_SMOKE === "true" &&
  window.location.pathname === "/__badge_smoke";
const actor={id:"badge-smoke-teacher",username:"badge-smoke-teacher",
  name:"ครูทดสอบระบบ",role:"teacher",status:"active",adminDept:"ฝ่ายวิชาการ",
  subjectArea:"วิทยาศาสตร์"};
const incoming=Array.from({length:5},(_,i)=>({
  id:"badge-smoke-"+i,createdBy:"badge-smoke-clerk",
  type:"หนังสือเข้า",status:"เผยแพร่แล้ว",subject:"หนังสือทดสอบ "+(i+1),
  date:"2026-11-10",createdAt:Date.now()-60000-i,
  publishedAt:Date.now()-50000-i,urgency:"ปกติ",
  recipientsSnapshot:[{id:actor.id,name:actor.name,role:"teacher"}],
  acknowledgedBy:window.location.search.includes("ack=1")&&i===0?[actor.id]:[],
  files:[],history:[]
}));
const fixture=smoke?
  <MainLayout firebaseUser={null} currentUser={actor} dbUsers={[actor]}
    systemSettings={DEFAULT_SETTINGS} onLogout={()=>{}}
    showToast={msg=>console.info("Fixture toast:",msg)}
    smokeDocuments={incoming}/>:
  <App/>;
createRoot(document.getElementById('root')).render(
  <React.StrictMode>{fixture}</React.StrictMode>
);
