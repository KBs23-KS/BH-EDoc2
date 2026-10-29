import React from "react";
import {Inbox,FileText,CheckCircle,FileSignature,Bell,ArrowUpRight,Clock3,Activity,ClipboardList,AlertCircle} from "lucide-react";
import {canReadDoc,eventTime,recipientsOf} from "./workflow";

const finished=["เผยแพร่แล้ว","อนุมัติ/สั่งการแล้ว"];
export function headTitles(user,settings={}) {
  if(!user)return [];
  const result=[];
  for (const [field,label,kind] of [["adminHeads","หัวหน้ากลุ่มงาน","admin"],["subjectHeads","หัวหน้ากลุ่มสาระ","subject"]]) {
    for(const [group,entry] of Object.entries(settings[field]||{})) {
      const primary=typeof entry==="string"?entry:entry?.primary;
      const acting=typeof entry==="string"?"":entry?.acting;
      if(primary===user.id||acting===user.id)result.push({kind,group,label:(primary===user.id?label:"รักษาการ"+label)});
    }
  }
  return result;
}
export function RoleIndicators({user,settings={},compact=false}) {
  const heads=headTitles(user,settings);
  if(!heads.length)return null;
  return <span className={"bhs-head-labels"+(compact?" bhs-head-labels-compact":"")}>
    {heads.map(h=><span key={h.kind+h.group} className={"bhs-head-label bhs-head-label-"+h.kind} title={h.group}>
      {h.label}{compact?"":" · "+h.group}
    </span>)}
  </span>;
}
const getTaskDocs=(docs,user)=>docs.filter(d=>
  (user.role==="director"&&d.status==="รอผู้อำนวยการ")||
  (user.role==="deputy"&&d.status==="รอรองผู้อำนวยการ")||
  (user.role==="admin"&&["รอรองผู้อำนวยการ","รอผู้อำนวยการ"].includes(d.status))||
  (d.createdBy===user.id&&d.status==="ส่งกลับแก้ไข")
);
function menuFor(doc) {
  if(doc.type==="คำสั่งโรงเรียน")return "orders";
  if(doc.type==="หนังสือเวียนแจ้งรับทราบ")return "circulars";
  return "incoming";
}
function labelFor(doc) {
  if(doc.status==="ส่งกลับแก้ไข")return "ส่งกลับแก้ไข";
  if(doc.status==="รอรองผู้อำนวยการ")return "รอรอง ผอ. ตรวจสอบ";
  if(doc.status==="รอผู้อำนวยการ")return "รอ ผอ. พิจารณา";
  return (doc.acknowledgedBy||[]).length?"มีผู้รับทราบแล้ว":"เผยแพร่หนังสือใหม่";
}
function shortDate(time) {
  if(!Number.isFinite(Number(time))||!Number(time))return "—";
  return new Date(Number(time)).toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"});
}
export default function DashboardHomePanels({documents=[],currentUser,dbUsers=[],systemSettings={},changeMenu}) {
  const visible=documents.filter(d=>!d.isDeleted&&canReadDoc(currentUser,d,dbUsers));
  const active=visible.slice().sort((a,b)=>eventTime(b)-eventTime(a));
  const heads=headTitles(currentUser,systemSettings);
  const headGroups=heads.map(h=>h.group);
  const groupPending=visible.filter(d=>finished.includes(d.status)&&headGroups.includes(d.assignedTo)&&!(d.headActions||[]).some(e=>e.group===d.assignedTo));
  const assigned=visible.filter(d=>finished.includes(d.status)&&[...(d.routingEntries||[]),...(d.headActions||[])].some(e=>(e.userIds||[]).includes(currentUser.id)) && !(d.assignmentAcknowledged||[]).some(k=>k.endsWith("::"+currentUser.id)));
  const pendingAcknowledgement=visible.filter(d=>finished.includes(d.status)&&recipientsOf(d,dbUsers).some(x=>x.id===currentUser.id)&&!(d.acknowledgedBy||[]).includes(currentUser.id));
  const actionDocs=getTaskDocs(documents.filter(d=>!d.isDeleted),currentUser);
  const director=["director","deputy","admin"].includes(currentUser.role);
  const items=director?[
    ...actionDocs.map(d=>({doc:d,title:labelFor(d),menu:d.status==="ส่งกลับแก้ไข"?"mydocs":"tasks",type:"priority"}))
  ]: [
    ...groupPending.map(d=>({doc:d,title:"หนังสือถึงกลุ่มที่คุณรับผิดชอบ",menu:"incoming",type:"priority"})),
    ...assigned.map(d=>({doc:d,title:"งานที่ได้รับมอบหมาย",menu:menuFor(d),type:"priority"})),
    ...pendingAcknowledgement.map(d=>({doc:d,title:"ยังไม่รับทราบ",menu:menuFor(d),type:"normal"})),
    ...visible.filter(d=>d.createdBy===currentUser.id&&d.status==="ส่งกลับแก้ไข").map(d=>({doc:d,title:"เอกสารถูกส่งกลับ",menu:"mydocs",type:"priority"}))
  ];
  const unique=new Map(); for(const item of items){if(!unique.has(item.doc.id+item.title))unique.set(item.doc.id+item.title,item);}
  const actionItems=[...unique.values()].sort((a,b)=>eventTime(b.doc)-eventTime(a.doc)).slice(0,4);
  const recent=active.filter(d=>finished.includes(d.status)||d.createdBy===currentUser.id).slice(0,5);
  return <div className="bhs-home-panels">
    <section className="bhs-home-panel">
      <header className="bhs-home-panel-head"><span className="bhs-home-panel-icon bhs-panel-amber"><ClipboardList size={19}/></span>
        <div><h2>สิ่งที่ต้องจัดการ</h2><p>เรียงตามความเคลื่อนไหวล่าสุด</p></div>
        <button type="button" onClick={()=>changeMenu(director?"tasks":"incoming")} className="bhs-home-panel-more">ดูทั้งหมด <ArrowUpRight size={15}/></button>
      </header>
      <div className="bhs-home-panel-body">
        {actionItems.map((item,i)=><button type="button" key={item.doc.id+"-"+i} className="bhs-home-item" onClick={()=>changeMenu(item.menu)}>
          <span className={"bhs-home-item-icon "+(item.type==="priority"?"bhs-panel-amber":"bhs-panel-blue")}>
            {item.type==="priority"?<AlertCircle size={19}/>:<FileText size={18}/>}</span>
          <span className="bhs-home-item-main"><strong>{item.doc.subject}</strong>
            <small>{item.title} · {item.doc.docNumber||item.doc.type}</small></span>
          <span className="bhs-home-item-meta">{shortDate(eventTime(item.doc))}</span>
        </button>)}
        {!actionItems.length&&<div className="bhs-home-empty"><CheckCircle size={24}/><strong>ไม่มีรายการค้างที่ต้องจัดการ</strong><span>เมื่อมีงานใหม่ ระบบจะแสดงที่นี่</span></div>}
      </div>
    </section>
    <section className="bhs-home-panel">
      <header className="bhs-home-panel-head"><span className="bhs-home-panel-icon bhs-panel-blue"><Activity size={19}/></span>
        <div><h2>ความเคลื่อนไหวล่าสุด</h2><p>เอกสารที่คุณมีสิทธิ์เข้าถึง</p></div>
        <button type="button" className="bhs-home-panel-more" onClick={()=>changeMenu("global_search")}>ดูทั้งหมด <ArrowUpRight size={15}/></button>
      </header>
      <div className="bhs-home-panel-body">
        {recent.map(d=><button type="button" key={d.id} className="bhs-home-item" onClick={()=>changeMenu(menuFor(d))}>
          <span className="bhs-home-item-icon bhs-panel-teal">{d.type==="หนังสือเข้า"?<Inbox size={18}/>:d.type==="คำสั่งโรงเรียน"?<FileText size={18}/>:<Bell size={18}/>}</span>
          <span className="bhs-home-item-main"><strong>{d.subject}</strong><small>{d.type} · {labelFor(d)}</small></span>
          <span className="bhs-home-item-meta">{shortDate(eventTime(d))}</span>
        </button>)}
        {!recent.length&&<div className="bhs-home-empty"><Clock3 size={24}/><strong>ยังไม่มีความเคลื่อนไหว</strong><span>ข้อมูลใหม่จะแสดงตามสิทธิ์ผู้ใช้งาน</span></div>}
      </div>
    </section>
  </div>;
}
