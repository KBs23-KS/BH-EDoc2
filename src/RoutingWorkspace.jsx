import React,{useMemo,useState} from "react";
import {headGroups,pendingHeadGroups,pendingAssignmentEvents,routingGroups,canViewRouted,isFinalDoc} from "./routing";
import {canReadDoc,recipientsOf} from "./workflow";

// A two-stage selector avoids dumping every group and teacher at once.
// Selection stays intact when switching categories, allowing mixed group + direct routes.
function Picker({users,selected,onChange,label}) {
  const [query,setQuery]=useState("");
  const normalized=query.trim().toLocaleLowerCase("th-TH");
  const visible=users.filter(u=>[u.name,u.adminDept,u.subjectArea].some(value=>String(value||"").toLocaleLowerCase("th-TH").includes(normalized))).slice(0,100);
  const toggle=id=>onChange(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id]);
  return <div className="space-y-2">
    <label className="block text-sm font-semibold text-slate-700">{label}</label>
    <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหาชื่อครู..." className="w-full border rounded-xl p-3 text-sm"/>
    <div className="max-h-52 overflow-y-auto rounded-xl border bg-white divide-y">
      {visible.map(u=><label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-blue-50">
        <input type="checkbox" checked={selected.includes(u.id)} onChange={()=>toggle(u.id)}/>
        <span className="flex-1">{u.name}</span>
        <small className="text-slate-400 text-right max-w-[45%]">{u.adminDept||u.subjectArea||""}</small>
      </label>)}
      {!visible.length&&<p className="p-3 text-sm text-slate-400">ไม่พบรายชื่อ</p>}
    </div>
    <p className="text-xs text-slate-500">เลือกครูแล้ว {selected.length} คน</p>
  </div>;
}
const groupTypes=[
  {value:"admin",label:"กลุ่มบริหารงาน"},
  {value:"subject",label:"กลุ่มสาระการเรียนรู้"},
  {value:"person",label:"ครูรายบุคคล"}
];
export function RoutingPicker({dbUsers,systemSettings,groups,setGroups,userIds,setUserIds,allowAll=false,all=false,setAll}) {
  const [mode,setMode]=useState("");
  const [search,setSearch]=useState("");
  const users=dbUsers.filter(u=>["teacher","clerk"].includes(u.role)&&u.status!=="inactive");
  const adminDepts=systemSettings.adminDepts||[];
  const subjectAreas=(systemSettings.subjectAreas||[]).filter(x=>x!=="ไม่มีกลุ่มสาระการเรียนรู้");
  const options=mode==="admin"?adminDepts:mode==="subject"?subjectAreas:[];
  const normalized=search.trim().toLocaleLowerCase("th-TH");
  const selectedNames=groups.concat(userIds.map(id=>users.find(u=>u.id===id)?.name||id));
  const changeMode=value=>{
    setMode(value);setSearch("");
    if(allowAll){
      if(value==="all"){setAll(true);setGroups([]);setUserIds([]);}
      else if(all)setAll(false);
    }
  };
  const toggleGroup=name=>setGroups(groups.includes(name)?groups.filter(x=>x!==name):[...groups,name]);
  return <div className="space-y-3">
    <label className="block text-sm font-semibold text-slate-700" htmlFor="routing-category">
      ขั้นที่ 1 เลือกประเภทผู้รับ
    </label>
    <select id="routing-category" value={mode} onChange={e=>changeMode(e.target.value)}
      className="w-full border rounded-xl bg-white p-3 text-sm">
      <option value="">-- กดเลือกประเภทผู้รับก่อน --</option>
      {allowAll&&<option value="all">แจ้งทุกคน</option>}
      {groupTypes.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {(mode==="admin"||mode==="subject")&&<div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-700">ขั้นที่ 2 ติ๊กเลือก{mode==="admin"?"กลุ่มบริหารงาน":"กลุ่มสาระ"} (เลือกได้หลายรายการ)</label>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อกลุ่ม..." className="w-full border rounded-xl p-3 text-sm"/>
      <div className="max-h-52 overflow-y-auto rounded-xl border bg-white divide-y">
        {options.filter(name=>name.toLocaleLowerCase("th-TH").includes(normalized)).map(name=>
          <label key={name} className="flex gap-2 items-center px-3 py-2 text-sm cursor-pointer hover:bg-blue-50">
            <input type="checkbox" checked={groups.includes(name)} onChange={()=>toggleGroup(name)}/>
            <span>{name}</span>
          </label>)}
        {!options.length&&<p className="p-3 text-sm text-slate-400">ไม่มีรายชื่อกลุ่มในระบบ</p>}
      </div>
    </div>}
    {mode==="person"&&<div className="space-y-2">
      <p className="text-sm font-semibold text-slate-700">ขั้นที่ 2 ติ๊กเลือกชื่อครูที่ต้องการมอบหมาย</p>
      <Picker users={users} selected={userIds} onChange={setUserIds} label="ค้นหาและเลือกครูได้หลายคน"/>
    </div>}
    {mode==="all"&&<p className="text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-xl p-3">ระบบจะส่งถึงครูและบุคลากรทุกคนที่มีสิทธิ์รับหนังสือ</p>}
    {!all&&selectedNames.length>0&&<div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 space-y-1">
      <b>ผู้รับที่เลือกไว้ {groups.length} กลุ่ม / {userIds.length} คน</b>
      <p className="leading-relaxed">{selectedNames.join(", ")}</p>
      <p className="text-blue-600">เปลี่ยนประเภทด้านบนเพื่อเลือกเพิ่มเติมได้ รายการที่ติ๊กแล้วจะยังอยู่</p>
    </div>}
  </div>;
}
function HeadRecipientPicker({users,kind,group,dbUsers,systemSettings,selected,onChange}) {
  const [mode,setMode]=useState("");
  const [chosenGroup,setChosenGroup]=useState("");
  const [search,setSearch]=useState("");
  const admin=kind==="admin";
  const options=mode==="admin"?(systemSettings.adminDepts||[]):mode==="subject"?(systemSettings.subjectAreas||[]).filter(x=>x!=="ไม่มีกลุ่มสาระการเรียนรู้"):[];
  const narrowed=admin
    ? mode==="all"?users:mode==="admin"&&chosenGroup?users.filter(u=>u.adminDept===chosenGroup):mode==="subject"&&chosenGroup?users.filter(u=>u.subjectArea===chosenGroup):[]
    : mode==="own"?users.filter(u=>u.subjectArea===group):[];
  const filtered=narrowed.filter(u=>[u.name,u.adminDept,u.subjectArea].some(v=>String(v||"").toLocaleLowerCase("th-TH").includes(search.toLocaleLowerCase("th-TH"))));
  const toggle=id=>onChange(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id]);
  return <div className="space-y-3">
    <label className="block text-sm font-semibold text-slate-700" htmlFor="head-route-mode">
      ขั้นที่ 1 เลือกวิธีค้นหาครูที่จะเกษียณต่อ
    </label>
    <select id="head-route-mode" value={mode} onChange={e=>{setMode(e.target.value);setChosenGroup("");setSearch("");}}
      className="w-full p-3 border bg-white rounded-xl text-sm">
      <option value="">-- กดเลือกก่อน จึงแสดงรายชื่อครูให้ติ๊ก --</option>
      {admin
        ? <><option value="admin">เลือกจากกลุ่มบริหารงาน</option><option value="subject">เลือกจากกลุ่มสาระ</option><option value="all">ค้นหาครูทั้งหมด (ข้ามกลุ่มงานได้)</option></>
        : <option value="own">ครูในกลุ่มสาระ {group}</option>}
    </select>
    {admin&&(mode==="admin"||mode==="subject")&&<label className="block space-y-1">
      <span className="block text-sm font-semibold text-slate-700">ขั้นที่ 2 เลือก{mode==="admin"?"กลุ่มบริหารงาน":"กลุ่มสาระ"}ที่จะค้นหารายชื่อ</span>
      <select value={chosenGroup} onChange={e=>{setChosenGroup(e.target.value);setSearch("");}}
        className="w-full border rounded-xl bg-white p-3 text-sm">
        <option value="">-- เลือกกลุ่ม --</option>
        {options.map(name=><option key={name} value={name}>{name}</option>)}
      </select>
    </label>}
    {((admin&&(mode==="all"||Boolean(chosenGroup)))||(!admin&&mode==="own"))&&<div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-700">ติ๊กเลือกชื่อครู (เลือกได้หลายคน)</label>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อครู..." className="w-full p-3 border rounded-xl text-sm"/>
      <div className="max-h-52 overflow-y-auto rounded-xl border bg-white divide-y">
        {filtered.map(u=><label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-blue-50">
          <input type="checkbox" checked={selected.includes(u.id)} onChange={()=>toggle(u.id)}/>
          <span>{u.name}</span>
        </label>)}
        {!filtered.length&&<p className="p-3 text-sm text-slate-400">ไม่พบรายชื่อครูในกลุ่มที่เลือก</p>}
      </div>
    </div>}
    {!!selected.length&&<div className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1">
      <b>เลือกครูแล้ว {selected.length} คน</b>
      <p>{selected.map(id=>dbUsers.find(u=>u.id===id)?.name||id).join(", ")}</p>
      <p>เปลี่ยนกลุ่มเพื่อเลือกเพิ่มได้ รายชื่อเดิมไม่หาย</p>
    </div>}
    {!selected.length&&<p className="text-xs text-slate-500">ถ้าไม่มีครูต้องมอบหมาย สามารถกดรับทราบในฐานะหัวหน้าได้เลย</p>}
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
  const [supersedes,setSupersedes]=useState("");
  const routed=documents.filter(d=>isFinalDoc(d));
  const headPending=routed.flatMap(d=>pendingHeadGroups(d,currentUser,systemSettings).map(g=>({doc:d,group:g.group,kind:g.kind})));
  const headAvailable=routed.flatMap(d=>managed.filter(h=>routingGroups(d).includes(h.group)).map(h=>({doc:d,group:h.group,kind:h.kind})))
    .filter(x=>{const done=(x.doc.headActions||[]).filter(e=>e.group===x.group).at(-1);return !done||(done.userIds||[]).length>0});
  const display=canDirector?routed:headAvailable.map(x=>x.doc).filter((x,i,a)=>a.findIndex(k=>k.id===x.id)===i);
  const doc=display.find(d=>d.id===selectedDoc)||display[0];
  const myGroup=headAvailable.filter(x=>x.doc.id===doc?.id);
  const group=activeGroup&&myGroup.some(x=>x.group===activeGroup)?activeGroup:myGroup[0]?.group;
  const kind=myGroup.find(x=>x.group===group)?.kind;
  const completed=(doc?.headActions||[]).filter(e=>e.group===group).at(-1);
  const directorAssignable=(doc?.routingEntries||[]).filter(e=>(e.userIds||[]).length&&!(doc.routingEntries||[]).some(n=>n.supersedes===e.id));
  const candidates=dbUsers.filter(u=>["teacher","clerk"].includes(u.role)&&u.status!=="inactive"&&(canDirector||kind==="admin"||u.subjectArea===group));
  async function save(){
    if(!doc)return;
    if(canDirector&&!all&&!groups.length&&!ids.length)return;
    if(!canDirector&&!group)return;
    if(!confirm){setConfirm(true);return;}
    setBusy(true);
    try{
      if(canDirector)await onRoute(doc,{groups,userIds:ids,all,message,supersedes});
      else await onHeadAction(doc,{group,userIds:ids,message,reassign:!!completed});
      setSelectedDoc("");setGroups([]);setIds([]);setMessage("");setConfirm(false);setAll(false);setSupersedes("");
    }finally{setBusy(false);}
  }
  return <div className="space-y-5 max-w-5xl mx-auto">
    <header className="bhs-modern-page-title"><div><p className="text-xs uppercase tracking-widest text-blue-500 font-bold">BHS / ROUTING</p><h2 className="text-2xl font-bold text-slate-800">เกษียณและมอบหมายหนังสือ</h2><p className="text-sm text-slate-500 mt-1">การมอบหมายงานไม่ทำให้สมาชิกเดิมเสียสิทธิ์ดูหนังสือ</p></div><span className="bhs-modern-counter">{canDirector?routed.length:headPending.length} รายการ</span></header>
    {!canDirector&&!headAvailable.length&&<div className="bhs-modern-panel p-8 text-center text-slate-500">ไม่มีหนังสือรอเกษียณต่อหรือเปลี่ยนผู้รับมอบหมายในกลุ่มของคุณ</div>}
    {!!display.length&&<div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4">
      <section className="bhs-modern-panel overflow-hidden"><div className="p-4 border-b font-semibold">เลือกหนังสือ</div><div className="max-h-[560px] overflow-y-auto divide-y">{display.map(d=><button key={d.id} onClick={()=>{setSelectedDoc(d.id);setConfirm(false);setIds([]);setGroups([]);setSupersedes("")}} className={"block w-full text-left p-4 hover:bg-blue-50 "+(doc?.id===d.id?"bg-blue-50":"")}><div className="text-xs font-bold text-blue-600">{d.docNumber||d.type}</div><div className="font-semibold text-sm text-slate-800 mt-1">{d.subject}</div><div className="text-xs text-slate-500 mt-2">{d.status}</div></button>)}</div></section>
      <section className="bhs-modern-panel p-4 md:p-5 space-y-4">
        <div><h3 className="font-bold text-lg text-slate-800">{doc?.subject}</h3><button className="text-xs text-blue-600 underline mt-1" onClick={()=>onOpen(doc.id)}>เปิดดูเอกสารและข้อเกษียณ</button></div>
        {!canDirector&&<div><label className="text-xs font-bold text-slate-600">เกษียณในฐานะหัวหน้ากลุ่ม</label><select value={group||""} onChange={e=>{setActiveGroup(e.target.value);setIds([]);setConfirm(false)}} className="w-full p-3 border rounded-xl mt-1 text-sm">{myGroup.map(x=><option key={x.group} value={x.group}>{x.group}</option>)}</select></div>}
        {canDirector&&directorAssignable.length>0&&<label className="text-xs text-slate-600 block">เปลี่ยนผู้รับมอบหมายเดิม (ไม่บังคับ)
          <select value={supersedes} onChange={e=>setSupersedes(e.target.value)} className="w-full border bg-white rounded-xl p-3 mt-1 text-sm">
            <option value="">เกษียณ / มอบหมายใหม่ (ไม่แทนรายการเดิม)</option>
            {directorAssignable.map(e=><option key={e.id} value={e.id}>แทนรายการ {new Date(e.at||0).toLocaleString("th-TH")} — {(e.userIds||[]).map(id=>dbUsers.find(u=>u.id===id)?.name||id).join(", ")}</option>)}
          </select>
        </label>}
        {completed&&<p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3">หัวหน้าเกษียณไปแล้ว คุณสามารถเปลี่ยนรายชื่อผู้รับมอบหมาย โดยจะเก็บประวัติเดิมไว้</p>}
        {canDirector?<RoutingPicker dbUsers={dbUsers} systemSettings={systemSettings} groups={groups} setGroups={setGroups} userIds={ids} setUserIds={setIds} allowAll all={all} setAll={setAll}/>:<HeadRecipientPicker key={group} users={candidates} kind={kind} group={group} dbUsers={dbUsers} systemSettings={systemSettings} selected={ids} onChange={setIds}/>}
        <label className="block space-y-1"><span className="font-semibold text-sm text-slate-700">ข้อเกษียณ / ข้อสั่งการ</span><textarea value={message} onChange={e=>setMessage(e.target.value)} rows={3} className="w-full p-3 border rounded-xl text-sm" placeholder="บันทึกข้อสั่งการตามหนังสือ..."/></label>
        {!canDirector&&!completed&&!ids.length&&<p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3">ไม่เลือกครู = หัวหน้ากดรับทราบและจบงานส่วนของตน</p>}
        {confirm&&<div className="border border-amber-200 bg-amber-50 p-3 rounded-xl text-sm"><b>ตรวจสอบก่อนยืนยัน</b><p>ถึงกลุ่ม: {canDirector?(all?"ทุกคน":groups.join(", ")||"—"):group}</p><p>ถึงครู: {ids.map(id=>dbUsers.find(u=>u.id===id)?.name).join(", ")||"ไม่มอบหมายรายบุคคล"}</p><p>ข้อสั่งการ: {message||"—"}</p></div>}
        <button disabled={busy} onClick={save} className="bg-blue-700 hover:bg-blue-800 text-white rounded-xl w-full py-3 text-sm font-bold disabled:opacity-50">{busy?"กำลังบันทึก...":confirm?"ยืนยันและบันทึก":completed||supersedes?"ตรวจสอบการเปลี่ยนผู้รับ":"ตรวจสอบก่อนเกษียณ"}</button>
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
  const nextUnread=visible.slice(idx+1).find(d=>isFinalDoc(d)&&recipientsOf(d,dbUsers).some(r=>r.id===currentUser.id)&&!(d.acknowledgedBy||[]).includes(currentUser.id));
  const entries=[...(doc.history||[]).map(h=>({id:h.timestamp||h.time,actor:h.byName||h.role||"ระบบ",desc:h.action+(h.detail&&h.detail!=="-"?" — "+h.detail:""),date:h.timestamp||h.time})),...(doc.routingEntries||[]).map(e=>({id:e.id,actor:e.byName||"ผู้อำนวยการ",desc:"เกษียณ: "+(e.message||"แจ้งเพื่อทราบ"),date:e.at})),...(doc.headActions||[]).map(e=>({id:e.id,actor:e.byName||"หัวหน้ากลุ่ม",desc:e.group+" — "+(e.userIds?.length?"มอบหมายให้ "+e.userIds.length+" คน":"รับทราบ")+" "+(e.message||""),date:e.at}))].sort((a,b)=>(b.date||0)-(a.date||0));
  const latestDirective=[...(doc.routingEntries||[]),...(doc.headActions||[])].sort((a,b)=>(b.at||0)-(a.at||0))[0];
  const last=latestDirective?{actor:latestDirective.byName||"ผู้เกษียณ",desc:latestDirective.message||"แจ้งเพื่อทราบ",date:latestDirective.at}:entries[0];
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
      {target&&!acked&&isFinalDoc(doc)&&nextUnread&&<button disabled={busy} onClick={()=>act(async()=>{await onAcknowledge(doc);onBack(nextUnread.id)})} className="bhs-modern-outline">รับทราบและเปิดหนังสือถัดไป →</button>}
      {assigned.map(e=><button key={e.id} disabled={busy} onClick={()=>act(()=>onAcknowledgeAssignment(doc,e))} className="bg-blue-700 text-white rounded-xl px-4 py-2 text-sm font-bold">รับทราบงานมอบหมาย · {e.kind==="director"?"จาก ผอ.":"จากหัวหน้า"}</button>)}
      {(["director","admin"].includes(currentUser.role)||pendingHeadGroups(doc,currentUser,systemSettings).length>0)&&<button onClick={()=>onOpenRouting(doc.id)} className="bhs-modern-outline">เกษียณ / มอบหมายต่อ</button>}
    </div>
    <div className="flex gap-1 border-b border-slate-200">{[["document","เอกสาร"],["timeline","Timeline"],["recipients","ผู้รับ/การรับทราบ"]].map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={"px-4 py-3 text-sm font-semibold border-b-2 "+(tab===id?"border-blue-600 text-blue-700":"border-transparent text-slate-500")}>{label}</button>)}</div>
    {tab==="document"&&<div className="bhs-modern-panel p-4 space-y-3"><h3 className="font-bold text-sm">ไฟล์ต้นฉบับและไฟล์ประกอบ</h3>{files.map((f,i)=><div key={i} className="space-y-2 border-b py-2"><a href={f.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-700 underline">{f.name||"ไฟล์แนบ "+(i+1)}</a>{(f.name||"").toLowerCase().endsWith(".pdf")&&<iframe title={f.name||"PDF"} src={f.driveId?"https://drive.google.com/file/d/"+encodeURIComponent(f.driveId)+"/preview":f.url} className="w-full min-h-[360px] border rounded-xl" loading="lazy"/>}</div>)}{!files.length&&<p className="text-sm text-slate-500">ไม่มีไฟล์แนบ</p>}</div>}
    {tab==="timeline"&&<div className="bhs-modern-panel p-5 space-y-5">{entries.map((e,i)=><EventLine key={e.id||i} actor={e.actor} desc={e.desc} date={e.date}/>)}{!entries.length&&<p className="text-sm text-slate-500">ยังไม่มีประวัติ</p>}</div>}
    {tab==="recipients"&&<div className="bhs-modern-panel p-5 space-y-2"><p className="text-sm text-slate-600">ผู้รับ {recipients.length} คน · รับทราบแล้ว {recipients.filter(r=>(doc.acknowledgedBy||[]).includes(r.id)).length} คน</p>{recipients.map(r=><div key={r.id} className="text-sm flex justify-between border-b py-2 gap-2"><span>{r.name}</span><span className={(doc.acknowledgedBy||[]).includes(r.id)?"text-emerald-700":"text-amber-700"}>{(doc.acknowledgedBy||[]).includes(r.id)?"รับทราบแล้ว":"ยังไม่รับทราบ"}</span></div>)}</div>}
  </div>;
}
