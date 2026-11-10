import React from 'react';
import { createRoot } from 'react-dom/client';
import App, {MainLayout, DEFAULT_SETTINGS} from './App';
import './style.css';

// Keep a rendering exception from producing an unexplained blank screen.
// No school data, passwords, or document subjects are logged.
class RenderBoundary extends React.Component {
  constructor(props){super(props);this.state={failed:false};}
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error){
    if(import.meta.env.VITE_BHS_BROWSER_SMOKE==="true")
      window.__bhsSmokeRenderError={
        name:String(error?.name||"Error"),
        message:String(error?.message||"unknown"),
        stack:String(error?.stack||"").slice(0,1200)
      };
    console.error("BHS E-Document rendering error:",error?.name||"Error");
  }
  render(){
    if(this.state.failed)return (
      <main style={{fontFamily:"sans-serif",padding:"2rem",maxWidth:520,margin:"10vh auto"}}>
        <h1>ไม่สามารถแสดงหน้าระบบได้</h1>
        <p>เกิดปัญหาการแสดงผล กรุณาโหลดหน้าอีกครั้ง หากยังพบปัญหาให้แจ้งผู้ดูแลระบบ</p>
        <button type="button" onClick={()=>window.location.reload()}
          style={{padding:"0.8rem 1rem",border:"1px solid #aaa",borderRadius:8}}>
          โหลดหน้าอีกครั้ง
        </button>
      </main>
    );
    return this.props.children;
  }
}

// CI-only fixture to exercise the AUTHENTICATED layout with real React hooks,
// without logging in, using school credentials, or touching Firestore.
// Vite removes this path from ordinary Preview / Production builds.
const smoke = import.meta.env.VITE_BHS_BROWSER_SMOKE === "true" &&
  window.location.pathname === "/__badge_smoke";
const smokeRole=new URLSearchParams(window.location.search).get("role");
const actorRole=["director","deputy","admin"].includes(smokeRole)?
  smokeRole:"teacher";
const actor={id:"badge-smoke-teacher",username:"badge-smoke-teacher",
  name:"บัญชีทดสอบระบบ",role:actorRole,status:"active",adminDept:"ฝ่ายวิชาการ",
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
// Legacy/malformed documents were a plausible source of the crash.
// They must not make the app render a blank page or inflate the exact count.
const malformed={...incoming[0],id:"bad-legacy-snapshot",
  recipientsSnapshot:[null],acknowledgedBy:[]};
const executiveDoc={...incoming[0],
  status:actorRole==="director"?"รอผู้อำนวยการ":"รอรองผู้อำนวยการ",
  acknowledgedBy:[]};
const fixture=smoke?
  <MainLayout firebaseUser={null} currentUser={actor} dbUsers={[actor]}
    systemSettings={DEFAULT_SETTINGS} onLogout={()=>{}}
    showToast={msg=>console.info("Fixture toast:",msg)}
    smokeDocuments={actorRole==="teacher"?
      [...incoming,malformed]:[executiveDoc]}/>:
  <App/>;
createRoot(document.getElementById('root')).render(
  <React.StrictMode><RenderBoundary>{fixture}</RenderBoundary></React.StrictMode>
);
