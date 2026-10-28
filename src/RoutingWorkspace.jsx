import React,{useMemo,useState} from "react";
import {headGroups,pendingHeadGroups,pendingAssignmentEvents,routingGroups,canViewRouted,isFinalDoc} from "./routing";
import {canReadDoc,recipientsOf} from "./workflow";

function Picker({users,selected,onChange,label}) {
  const [query,setQuery]=useState("");
  const visible=users.filter(u=>u.name.toLowerCase().includes(query.toLowerCase())||u.adminDept?.toLowerCase().includes(query.toLowerCase())).slice(0,60);
  return <div className="space-y-2"><label className="block text-sm font-semibold text-slate-700">{label}</label>
    <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหาชื่อครู..." className="w-full border rounded-xl p-3 text-sm"/>
    <div className="max-h-36 overflow-y-auto rounded-xl border divide-y">
      {visible.map(u=><label key={u.id} className="flex gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-blue-50">
        <input type="checkbox" checked={selected.includes(u.id)} onChange={e=>onChange(e.target.checked?[...selected,u.id]:selected.filter(id=>id!==u.id))}/>
        <span>{u.name}</span><small className="ml-auto text-slate-400">{u.adminDept||u.subjectArea||""}</small>
      </label>)}
      {!visible.length&&<p className="p-3 text-sm text-slate-400">ไม่พบรายชื่อ</p>}
    </div>
    <p className="text-xs text-slate-500">เลือกแล้ว {selected.length} คน</p>
  </div>;
}
export function RoutingPicker({dbUsers,systemSettings,groups,setGroups,userIds,setUserIds,allowAll=false,all=false,setAll}) {
  const [search,setSearch]=useState("");
  const options=[...(systemSettings.adminDepts||[]),...(systemSettings.subjectAreas||[]).filter(x=>x!=="ไม่มีกลุ่มสาระการเรียนรู้")];
  const users=dbUsers.filter(u=>["teacher","clerk"].includes(u.role)&&u.status!=="inactive");
  return <div className="space-y-3">
    {allowAll&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/> แจ้งทุกคน</label>}
    {!all&&<><label className="block text-sm font-semibold text-slate-700">เลือกกลุ่มงาน/กลุ่มสาระ (หลายกลุ่มได้)</label>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหากลุ่มงานหรือกลุ่มสาระ" className="w-full border rounded-xl p-3 text-sm"/>
      <div className="max-h-36 overflow-y-auto rounded-xl border divide-y">{options.filter(x=>x.toLowerCase().includes(search.toLowerCase())).map(g=>
        <label key={g} className="flex gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-blue-50"><input type="checkbox" checked={groups.includes(g)} onChange={e=>setGroups(e.target.checked?[...groups,g]:groups.filter(x=>x!==g))}/>{g}</label>
      )}</div>
      <Picker users={users} selected={userIds} onChange={setUserIds} label="มอบหมายถึงครูโดยตรง (เลือกหลายคนได้)"/>
    </>}
  </div>;
}
export function RoutingWorkspace({documents,currentUser,dbUsers,systemSettings,onRoute,onHeadAction,onOpen}) {
  const managed=headGroups(currentUser,systemSettings);
  const canDirector=["director","admin"].includes(currentUser.role);
  const [selectedDoc,setSelectedDoc]=useState("");
  const [activeGroup,setActiveGroup]=useState("");
  const [groups,setGroups]=useState([]);
  const [ids,setIds]=useState([]);
  const [all,setAll]=useState(false);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [confirm,setConfirm]=useState(false);
  const routed=documents.filter(d=>isFinalDoc(d));
  const headPending=routed.flatMap(d=>pendingHeadGroups(d,currentUser,systemSettings).map(g=>({doc:d,group:g.group,kind:g.kind})));
  const display=canDirector?routed:headPending.map(x=>x.doc).filter((x,i,a)=>a.findIndex(k=>k.id===x.id)===i);
  const doc=display.find(d=>d.id===selectedDoc)||display[0];
  const myGroup=headPending.filter(x=>x.doc.id===doc?.id);
  const group=activeGroup&&myGroup.some(x=>x.group===activeGroup)?activeGroup:myGroup[0]?.group;
  const kind=myGroup.find(x=>x.group===group)?.kind;
  const candidates=dbUsers.filter(u=>["teacher","clerk"].includes(u.role)&&u.status!=="inactive"&&(canDirector||kind==="admin"||u.subjectArea===group));
  async function save(){
    if(!doc)return;
    if(canDirector&&!all&&!groups.length&&!ids.length)return;
    if(!canDirector&&!group)return;
    if(!confirm){setConfirm(true);return;}
    setBusy(true);
    try{
      if(canDirector)await onRoute(doc,{groups,userIds:ids,all,message});
      else await onHeadAction(doc,{group,userIds:ids,message});
      setSelectedDoc("");setGroups([]);setIds([]);setMessage("");setConfirm(false);setAll(false);
    }finally{setBusy(false);}
  }
  return <div className="space-y-5 max-w-5xl mx-auto">
    <header className="bhs-modern-page-title"><div><p className="text-xs uppercase tracking-widest text-blue-500 font-bold">BHS / ROUTING</p><h2 className="text-2xl font-bold text-slate-800">เกษียณและมอบหมายหนังสือ</h2><p className="text-sm text-slate-500 mt-1">การมอบหมายงานไม่ทำให้สมาชิกเดิมเสียสิทธิ์ดูหนังสือ</p></div><span className="bhs-modern-counter">{canDirector?routed.length:headPending.length} รายการ</span></header>
    {!canDirector&&!headPending.length&&<div className="bhs-modern-panel p-8 text-center text-slate-500">ไม่มีหนังสือรอเกษียณต่อในกลุ่มที่คุณรับผิดชอบ</div>}
    {!!display.length&&<div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4">
      <section className="bhs-modern-panel overflow-hidden"><div className="p-4 border-b font-semibold">เลือกหนังสือ</div><div className="max-h-[560px] overflow-y-auto divide-y">{display.map(d=><button key={d.id} onClick={()=>{setSelectedDoc(d.id);setConfirm(false);setIds([]);setGroups([])}} className={"block w-full text-left p-4 hover:bg-blue-50 "+(doc?.id===d.id?"bg-blue-50":"")}><div className="text-xs font-bold text-blue-600">{d.docNumber||d.type}</div><div className="font-semibold text-sm text-slate-800 mt-1">{d.subject}</div><div className="text-xs text-slate-500 mt-2">{d.status}</div></button>)}</div></section>
      <section className="bhs-modern-panel p-4 md:p-5 space-y-4">
        <div><h3 className="font-bold text-lg text-slate-800">{doc?.subject}</h3><button className="text-xs text-blue-600 underline mt-1" onClick={()=>onOpen(doc.id)}>เปิดดูเอกสารและข้อเกษียณ</button></div>
        {!canDirector&&<div><label className="text-xs font-bold text-slate-600">เกษียณในฐานะหัวหน้ากลุ่ม</label><select value={group||""} onChange={e=>{setActiveGroup(e.target.value);setIds([]);setConfirm(false)}} className="w-full p-3 border rounded-xl mt-1 text-sm">{myGroup.map(x=><option key={x.group} value={x.group}>{x.group}</option>)}</select></div>}
        {canDirector?<RoutingPicker dbUsers={dbUsers} systemSettings={systemSettings} groups={groups} setGroups={setGroups} userIds={ids} setUserIds={setIds} allowAll all={all} setAll={setAll}/>:<Picker users={candidates} selected={ids} onChange={setIds} label={kind==="admin"?"มอบหมายถึงครู (ข้ามกลุ่มงานได้)":"มอบหมายถึงครูในกลุ่มสาระของตน"}/>}
        <label className="block space-y-1"><span className="font-semibold text-sm text-slate-700">ข้อเกษียณ / ข้อสั่งการ</span><textarea value={message} onChange={e=>setMessage(e.target.value)} rows={3} className="w-full p-3 border rounded-xl text-sm" placeholder="บันทึกข้อสั่งการตามหนังสือ..."/></label>
        {!canDirector&&!ids.length&&<p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3">ไม่เลือกครู = หัวหน้ากดรับทราบและจบงานส่วนของตน</p>}
        {confirm&&<div className="border border-amber-200 bg-amber-50 p-3 rounded-xl text-sm"><b>ตรวจสอบก่อนยืนยัน</b><p>ถึงกลุ่ม: {canDirector?(all?"ทุกคน":groups.join(", ")||"—"):group}</p><p>ถึงครู: {ids.map(id=>dbUsers.find(u=>u.id===id)?.name).join(", ")||"ไม่มอบหมายรายบุคคล"}</p><p>ข้อสั่งการ: {message||"—"}</p></div>}
        <button disabled={busy} onClick={save} className="bg-blue-700 hover:bg-blue-800 text-white rounded-xl w-full py-3 text-sm font-bold disabled:opacity-50">{busy?"กำลังบันทึก...":confirm?"ยืนยันและบันทึก":"ตรวจสอบก่อนเกษียณ"}</button>
      </section>
    </div>}
  </div>;
}
function EventLine({actor,desc,date}) {return <div className="flex gap-3 text-sm"><span className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0"/><div><b className="text-slate-700">{actor}</b><div className="text-slate-600">{desc}</div><div className="text-xs text-slate-400 mt-1">{date?new Date(date).toLocaleString("th-TH"):""}</div></div></div>;}
export function DocumentDetail({doc,allDocs=[],currentUser,dbUsers,systemSettings,onAcknowledge,onAcknowledgeAssignment,onOpenRouting,onBack}) {
  const [tab,setTab]=useState("document"),[busy,setBusy]=useState(false);
  if(!doc)return <div className="bhs-modern-panel p-8">ไม่พบเอกสาร หรือไม่มีสิทธิ์เปิดดู</div>;
  const recipients=recipientsOf(doc,dbUsers);
  const target=recipients.some(x=>x.id===currentUser.id);
  const acked=(doc.acknowledgedBy||[]).includes(currentUser.id);
  const assigned=pendingAssignmentEvents(doc,currentUser);
  const canRead=canReadDoc(currentUser,doc,dbUsers)||canViewRouted(currentUser,doc,dbUsers,systemSettings);
  const visible=allDocs.filter(d=>canReadDoc(currentUser,d,dbUsers)||canViewRouted(currentUser,d,dbUsers));
  const idx=visible.findIndex(d=>d.id===doc.id);
  const entries=[...(doc.history||[]).map(h=>({id:h.timestamp||h.time,actor:h.byName||h.role||"ระบบ",desc:h.action+(h.detail&&h.detail!=="-"?" — "+h.detail:""),date:h.timestamp||h.time})),...(doc.routingEntries||[]).map(e=>({id:e.id,actor:e.byName||"ผู้อำนวยการ",desc:"เกษียณ: "+(e.message||"แจ้งเพื่อทราบ"),date:e.at})),...(doc.headActions||[]).map(e=>({id:e.id,actor:e.byName||"หัวหน้ากลุ่ม",desc:e.group+" — "+(e.userIds?.length?"มอบหมายให้ "+e.userIds.length+" คน":"รับทราบ")+" "+(e.message||""),date:e.at}))].sort((a,b)=>(b.date||0)-(a.date||0));
  const last=entries[0];
  const files=[...(doc.signedFiles?.length?doc.signedFiles:doc.files||[]),...(doc.extraAttachments||[])];
  async function act(fn){setBusy(true);try{await fn()}finally{setBusy(false)}}
  const copyLink=()=>{const u=new URL(window.location.href);u.searchParams.set("doc",doc.id);navigator.clipboard.writeText(u.toString());};
  if(!canRead)return <div className="bhs-modern-panel p-8">คุณไม่มีสิทธิ์ดูเอกสารนี้</div>;
  return <div className="max-w-5xl mx-auto space-y-4">
    <div className="flex flex-wrap gap-2 justify-between items-center"><button className="text-sm text-blue-700 font-semibold" onClick={onBack}>← กลับ</button><div className="flex flex-wrap gap-2"><button onClick={copyLink} className="bhs-modern-outline">คัดลอกลิงก์เอกสาร</button>{idx>=0&&idx<visible.length-1&&<button className="bhs-modern-outline" onClick={()=>onBack(visible[idx+1].id)}>เอกสารถัดไป →</button>}</div></div>
    <header className="bhs-modern-panel p-5 space-y-2"><p className="text-xs font-bold text-blue-700">{doc.docNumber||doc.type}</p><h2 className="text-xl md:text-2xl font-bold text-slate-800">{doc.subject}</h2><p className="text-sm text-slate-500">{doc.type} · {doc.status} · ไฟล์แนบ {files.length} ไฟล์</p></header>
    {last&&<div className="rounded-xl p-4 bg-blue-50 border border-blue-100"><b className="text-blue-800 text-sm">ข้อสั่งการ / ประวัติล่าสุด</b><div className="text-sm mt-2">{last.desc}</div><div className="text-xs text-slate-500 mt-1">{last.actor} · {last.date?new Date(last.date).toLocaleString("th-TH"):""}</div></div>}
    <div className="flex flex-wrap gap-2">
      {target&&!acked&&isFinalDoc(doc)&&<button disabled={busy} onClick={()=>act(()=>onAcknowledge(doc))} className="bg-emerald-700 text-white rounded-xl px-4 py-2 text-sm font-bold">รับทราบหนังสือ</button>}
      {assigned.map(e=><button key={e.id} disabled={busy} onClick={()=>act(()=>onAcknowledgeAssignment(doc,e))} className="bg-blue-700 text-white rounded-xl px-4 py-2 text-sm font-bold">รับทราบงานมอบหมาย · {e.kind==="director"?"จาก ผอ.":"จากหัวหน้า"}</button>)}
      {(["director","admin"].includes(currentUser.role)||pendingHeadGroups(doc,currentUser,systemSettings).length>0)&&<button onClick={()=>onOpenRouting(doc.id)} className="bhs-modern-outline">เกษียณ / มอบหมายต่อ</button>}
    </div>
    <div className="flex gap-1 border-b border-slate-200">{[["document","เอกสาร"],["timeline","Timeline"],["recipients","ผู้รับ/การรับทราบ"]].map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={"px-4 py-3 text-sm font-semibold border-b-2 "+(tab===id?"border-blue-600 text-blue-700":"border-transparent text-slate-500")}>{label}</button>)}</div>
    {tab==="document"&&<div className="bhs-modern-panel p-4 space-y-3"><h3 className="font-bold text-sm">ไฟล์ต้นฉบับและไฟล์ประกอบ</h3>{files.map((f,i)=><div key={i} className="space-y-2 border-b py-2"><a href={f.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-700 underline">{f.name||"ไฟล์แนบ "+(i+1)}</a>{(f.name||"").toLowerCase().endsWith(".pdf")&&<iframe title={f.name||"PDF"} src={f.url} className="w-full min-h-[360px] border rounded-xl" loading="lazy"/>}</div>)}{!files.length&&<p className="text-sm text-slate-500">ไม่มีไฟล์แนบ</p>}</div>}
    {tab==="timeline"&&<div className="bhs-modern-panel p-5 space-y-5">{entries.map((e,i)=><EventLine key={e.id||i} actor={e.actor} desc={e.desc} date={e.date}/>)}{!entries.length&&<p className="text-sm text-slate-500">ยังไม่มีประวัติ</p>}</div>}
    {tab==="recipients"&&<div className="bhs-modern-panel p-5 space-y-2"><p className="text-sm text-slate-600">ผู้รับ {recipients.length} คน · รับทราบแล้ว {recipients.filter(r=>(doc.acknowledgedBy||[]).includes(r.id)).length} คน</p>{recipients.map(r=><div key={r.id} className="text-sm flex justify-between border-b py-2 gap-2"><span>{r.name}</span><span className={(doc.acknowledgedBy||[]).includes(r.id)?"text-emerald-700":"text-amber-700"}>{(doc.acknowledgedBy||[]).includes(r.id)?"รับทราบแล้ว":"ยังไม่รับทราบ"}</span></div>)}</div>}
  </div>;
}
