import React,{useEffect,useMemo,useState} from "react";
import {headGroups,pendingHeadGroups,completedHeadGroups,pendingAssignmentEvents,routingGroups,canViewRouted,isFinalDoc,isRoutingEligibleDoc,directorHeadRoutingProgress} from "./routing";
import {canReadDoc,recipientsOf} from "./workflow";
import {formatIncomingReceiptNumber,formatDocumentNumber} from "./incomingReceiptDisplay";

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
  {value:"both",label:"ทั้งกลุ่มบริหารงานและกลุ่มสาระ"},
  {value:"person",label:"เจาะจงครูรายบุคคล"}
];
export function RoutingPicker({dbUsers,systemSettings,groups,setGroups,userIds,setUserIds,allowAll=false,all=false,setAll}) {
  const [mode,setMode]=useState("");
  const [search,setSearch]=useState("");
  const users=dbUsers.filter(u=>["teacher","clerk"].includes(u.role)&&u.status!=="inactive");
  const adminDepts=systemSettings.adminDepts||[];
  const subjectAreas=(systemSettings.subjectAreas||[]).filter(x=>x!=="ไม่มีกลุ่มสาระการเรียนรู้");
  const options=mode==="admin"?adminDepts:mode==="subject"?subjectAreas:mode==="both"?[...adminDepts,...subjectAreas]:[];
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
    {(mode==="admin"||mode==="subject"||mode==="both")&&<div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-700">ขั้นที่ 2 ติ๊กเลือก{mode==="admin"?"กลุ่มบริหารงาน":mode==="subject"?"กลุ่มสาระ":"กลุ่มบริหารงานและกลุ่มสาระ"} (เลือกได้หลายรายการ)</label>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อกลุ่ม..." className="w-full border rounded-xl p-3 text-sm"/>
      <div className="max-h-52 overflow-y-auto rounded-xl border bg-white divide-y">
        {options.filter(name=>name.toLocaleLowerCase("th-TH").includes(normalized)).map((name,index)=><label key={name+"-"+index} className="flex gap-2 items-center px-3 py-2 text-sm cursor-pointer hover:bg-blue-50">
            <input type="checkbox" checked={groups.includes(name)} onChange={()=>toggleGroup(name)}/>
            <span className="flex-1">{name}</span>
            {mode==="both"&&<span className="text-[10px] bg-slate-100 text-slate-500 rounded px-2 py-1">{adminDepts.includes(name)?"กลุ่มงาน":"กลุ่มสาระ"}</span>}
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
// A unified directory picker for both directors and heads. The user chooses how
// to view the directory before names appear. Filters never grant extra permissions.
function TeacherDirectoryPicker({users,selected,onChange,systemSettings,restrictedSubject=""}) {
  const [mode,setMode]=useState("");
  const [chosen,setChosen]=useState("");
  const [search,setSearch]=useState("");
  const eligible=users.filter(u=>["teacher","clerk"].includes(u.role)&&u.status!=="inactive"&&(!restrictedSubject||u.subjectArea===restrictedSubject));
  const modes=[
    {id:"admin",label:"กลุ่มงาน"},
    {id:"subject",label:"กลุ่มสาระฯ"},
    {id:"all",label:"รายชื่อทั้งหมด"}
  ];
  const configured=mode==="admin"?(systemSettings.adminDepts||[]):(systemSettings.subjectAreas||[]).filter(x=>x!=="ไม่มีกลุ่มสาระการเรียนรู้");
  const field=mode==="admin"?"adminDept":"subjectArea";
  const availableGroups=configured.filter(name=>eligible.some(u=>u[field]===name));
  const filteredByScope=mode==="all"?eligible:(chosen&&["admin","subject"].includes(mode)?eligible.filter(u=>u[field]===chosen):[]);
  const textQuery=search.trim().toLocaleLowerCase("th-TH");
  const visible=filteredByScope.filter(u=>[u.name,u.adminDept,u.subjectArea].some(v=>String(v||"").toLocaleLowerCase("th-TH").includes(textQuery)));
  const toggle=id=>onChange(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id]);
  const displayedIds=visible.map(u=>u.id);
  const allDisplayedSelected=displayedIds.length>0&&displayedIds.every(id=>selected.includes(id));
  const toggleDisplayed=()=>onChange(allDisplayedSelected?selected.filter(id=>!displayedIds.includes(id)):[...new Set([...selected,...displayedIds])]);
  const selectedNames=selected.map(id=>eligible.find(u=>u.id===id)?.name).filter(Boolean);
  return <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4" data-testid="routing-teacher-directory">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-sm font-extrabold text-slate-800">ค้นหาและเลือกครูผู้รับมอบหมาย</p>
        <p className="mt-1 text-xs text-slate-500">เลือกกลุ่มงาน กลุ่มสาระฯ หรือแสดงรายชื่อทั้งหมดก่อนติ๊กครู</p>
      </div>
      <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800">เลือกแล้ว {selected.length} คน</span>
    </div>
    <div className="grid grid-cols-3 gap-1.5 sm:gap-2" role="group" aria-label="กรองรายชื่อผู้รับมอบหมาย">
      {modes.map(item=><button key={item.id} type="button" aria-pressed={mode===item.id} onClick={()=>{setMode(item.id);setChosen("");setSearch("");}}
        className={"min-h-[42px] rounded-xl border px-2 py-2 text-xs font-bold transition-colors sm:text-sm "+(mode===item.id?"border-blue-500 bg-blue-50 text-blue-800 shadow-sm":"border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50")}>{item.label}</button>)}
    </div>
    {mode==="all"&&<p className="text-xs text-blue-700">แสดงรายชื่อครูและบุคลากรที่คุณมีสิทธิ์มอบหมายได้ทั้งหมด — ยังไม่ได้เลือกทุกคนอัตโนมัติ</p>}
    {(mode==="admin"||mode==="subject")&&<label className="block space-y-1">
      <span className="text-xs font-bold text-slate-700">เลือก{mode==="admin"?"กลุ่มงาน":"กลุ่มสาระการเรียนรู้"}</span>
      <select value={chosen} onChange={e=>{setChosen(e.target.value);setSearch("");}} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
        <option value="">— เลือกกลุ่มเพื่อแสดงรายชื่อ —</option>
        {availableGroups.map(x=><option value={x} key={x}>{x}</option>)}
      </select>
      {!availableGroups.length&&<span className="block text-xs text-slate-500">ไม่พบกลุ่มที่มีผู้ใช้ตรงตามสิทธิ์การมอบหมาย</span>}
    </label>}
    {(mode==="all"||Boolean(chosen))&&<>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input aria-label="ค้นหารายชื่อครู" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อครู..."
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"/>
        <button type="button" onClick={toggleDisplayed} disabled={!visible.length}
          className="rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">
          {allDisplayedSelected?"ยกเลิกที่แสดง":"เลือกทั้งหมดที่แสดง"} ({visible.length})
        </button>
      </div>
      <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
        {visible.map(u=><label key={u.id} className={"flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-sm "+(selected.includes(u.id)?"border-blue-200 bg-blue-50":"border-slate-200 bg-white hover:bg-blue-50")}>
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-700" checked={selected.includes(u.id)} onChange={()=>toggle(u.id)}/>
          <span className="min-w-0 flex-1"><span className="block break-words font-semibold text-slate-800">{u.name}</span>
            <span className="block text-[11px] text-slate-500">{u.adminDept||u.subjectArea||""}</span></span>
        </label>)}
        {!visible.length&&<div className="col-span-full rounded-xl bg-white p-3 text-center text-sm text-slate-500">ไม่พบรายชื่อครูในตัวกรองนี้</div>}
      </div>
    </>}
    {!mode&&<div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-500">เลือกหมวดรายชื่อก่อน เพื่อแสดงรายชื่อครูที่ต้องการติ๊ก</div>}
    {selectedNames.length>0&&<div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
      <p className="text-xs font-bold text-blue-800">รายชื่อที่เลือกไว้ ({selectedNames.length})</p>
      <div className="mt-2 flex flex-wrap gap-1.5">{selected.filter(id=>eligible.some(u=>u.id===id)).map(id=><button key={id} type="button" onClick={()=>toggle(id)}
        title="นำรายชื่อนี้ออก" className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs text-blue-800 hover:bg-blue-100">{eligible.find(u=>u.id===id)?.name} ×</button>)}</div>
      <p className="mt-2 text-[11px] text-blue-700">เปลี่ยนกลุ่มได้โดยรายชื่อที่เลือกก่อนหน้าจะยังอยู่</p>
    </div>}
  </div>;
}

export function RoutingWorkspace({documents,currentUser,dbUsers,systemSettings,onRoute,onHeadAction,onOpen,focusDocId=null}) {
  const canDirector=["director","admin"].includes(currentUser.role);
  const [selectedDoc,setSelectedDoc]=useState(focusDocId||"");
  const [activeGroup,setActiveGroup]=useState("");
  const [groups,setGroups]=useState([]);
  const [ids,setIds]=useState([]);
  const [broadcastAllTeachers,setBroadcastAllTeachers]=useState(false);
  const [all,setAll]=useState(false);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [confirm,setConfirm]=useState(false);
  const [supersedes,setSupersedes]=useState("");
  const [headTab,setHeadTab]=useState("pending");
  const [bookSearch,setBookSearch]=useState("");
  const [choice,setChoice]=useState(canDirector?"director-groups":"head-ack");
  const routed=documents.filter(isRoutingEligibleDoc);
  // A head appointed to multiple groups must complete each group separately.
  // Keep these exact tab relationships so existing workflow regression remains enforced.
  const uniqueHeadRows=rows=>rows.filter((x,i,all)=>all.findIndex(y=>y.doc.id===x.doc.id&&y.group===x.group)===i);
  const headPending=uniqueHeadRows(routed.flatMap(d=>pendingHeadGroups(d,currentUser,systemSettings).map(g=>({doc:d,group:g.group,kind:g.kind}))));
  const headDone=uniqueHeadRows(routed.flatMap(d=>completedHeadGroups(d,currentUser,systemSettings).map(g=>({doc:d,group:g.group,kind:g.kind}))));
  const directorProgress=directorHeadRoutingProgress(routed,dbUsers,systemSettings);
  const activeHeadRows=headTab==="completed"?headDone:headPending;
  const display=canDirector?routed:activeHeadRows.map(x=>x.doc).filter((x,i,a)=>a.findIndex(k=>k.id===x.id)===i);
  const query=bookSearch.trim().toLocaleLowerCase("th-TH");
  const filteredDisplay=query?display.filter(d=>[d.subject,d.docNumber,formatIncomingReceiptNumber(d.docNumber,""),d.from].some(x=>String(x||"").toLocaleLowerCase("th-TH").includes(query))):display;
  const doc=filteredDisplay.find(d=>d.id===selectedDoc)||filteredDisplay[0];
  const myGroup=activeHeadRows.filter(x=>x.doc.id===doc?.id);
  // A single matched group is automatic. Multiple eligible groups require an explicit choice.
  const group=activeGroup&&myGroup.some(x=>x.group===activeGroup)?activeGroup:(myGroup.length===1?myGroup[0].group:"");
  const kind=myGroup.find(x=>x.group===group)?.kind;
  const completed=(doc?.headActions||[]).filter(e=>e.group===group).at(-1);
  useEffect(()=>{
    if(canDirector)return;
    // Reuse the current recipients as a starting point when editing a completed action.
    setIds(headTab==="completed"?(completed?.userIds||[]):[]);
    setBroadcastAllTeachers(headTab==="completed"&&completed?.broadcastAllTeachers===true);
    setChoice(headTab==="completed"?(completed?.broadcastAllTeachers?"head-broadcast":"head-teachers"):"head-ack");
    setConfirm(false);
  },[canDirector,headTab,doc?.id,group]);
  const directorAssignable=(doc?.routingEntries||[]).filter(e=>(e.userIds||[]).length&&!(doc.routingEntries||[]).some(n=>n.supersedes===e.id));
  const candidates=dbUsers.filter(u=>["teacher","clerk"].includes(u.role)&&u.status!=="inactive"&&(canDirector||kind==="admin"||u.subjectArea===group));
  const chooseAction=next=>{
    setChoice(next);setConfirm(false);
    if(canDirector){
      // Prevent invisible recipients from a different action mode being submitted.
      setGroups([]);setIds([]);setAll(next==="director-all");
      if(next==="director-all")setSupersedes("");
    }
    if(next==="head-broadcast"){setBroadcastAllTeachers(true);setIds([]);}
    else if(!canDirector){setBroadcastAllTeachers(false);if(next==="head-ack")setIds([]);}
  };
  const selectBook=id=>{setSelectedDoc(id);setActiveGroup("");setConfirm(false);setIds([]);setGroups([]);setBroadcastAllTeachers(false);setAll(false);setMessage("");setSupersedes("");setChoice(canDirector?"director-groups":"head-ack");};
  function switchHeadTab(tab){
    setHeadTab(tab);setSelectedDoc("");setActiveGroup("");setIds([]);setBroadcastAllTeachers(false);setMessage("");setConfirm(false);setBookSearch("");
  }
  const unableToSave=!doc||busy||(!canDirector&&!group)||(canDirector&&!all&&!groups.length&&!ids.length)||
    (!canDirector&&(choice==="head-teachers"&&!ids.length))||(!canDirector&&!!completed&&choice==="head-ack")||
    (canDirector&&!!supersedes&&!ids.length);
  async function save(){
    if(!doc||!isRoutingEligibleDoc(doc)||unableToSave)return;
    if(!confirm){setConfirm(true);return;}
    setBusy(true);
    try{
      if(canDirector)await onRoute(doc,{groups,userIds:ids,all,message,supersedes});
      else await onHeadAction(doc,{group,userIds:choice==="head-teachers"?ids:[],message,reassign:!!completed,broadcastAllTeachers:choice==="head-broadcast"});
      setSelectedDoc("");setActiveGroup("");setGroups([]);setIds([]);setBroadcastAllTeachers(false);setMessage("");setConfirm(false);setAll(false);setSupersedes("");setChoice(canDirector?"director-groups":"head-ack");
    }finally{setBusy(false);}
  }
  const actions=canDirector?[
    {id:"director-groups",icon:"▦",name:"มอบหมายกลุ่มงาน",hint:"ส่งต่อกลุ่มงานหรือกลุ่มสาระ"},
    {id:"director-teachers",icon:"♙",name:"มอบหมายครู",hint:"ค้นหาและเลือกเป็นรายคน"},
    {id:"director-all",icon:"◎",name:"แจ้งทุกคน",hint:"แจ้งตามสิทธิ์ผู้รับหนังสือ"}
  ]:completed?[
    {id:"head-teachers",icon:"♙",name:"เปลี่ยนผู้รับมอบหมาย",hint:"แก้รายชื่อครูที่ได้รับงาน"},
    {id:"head-broadcast",icon:"◎",name:"ประชาสัมพันธ์ครูทุกคน",hint:"แจ้งเพื่ออ่านและรับทราบ"}
  ]:[
    {id:"head-ack",icon:"✓",name:"รับทราบ",hint:"จบงานของหัวหน้ากลุ่ม"},
    {id:"head-teachers",icon:"♙",name:"มอบหมายครู",hint:"ส่งงานให้ครูรายบุคคล"},
    {id:"head-broadcast",icon:"◎",name:"ประชาสัมพันธ์ทุกคน",hint:"ให้ครูทุกคนอ่านและรับทราบ"}
  ];
  const directive=doc?.directorCommand||[...(doc?.routingEntries||[])].at(-1)?.message||"";
  const chosenRecipientNames=ids.map(id=>dbUsers.find(u=>u.id===id)?.name||id);
  return <div className="mx-auto max-w-7xl space-y-5" data-testid="modern-routing-workspace">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-blue-600">BHS / DOCUMENT WORKFLOW</p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">เกษียณและมอบหมายหนังสือ</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">จัดการหนังสือ ส่งต่อ และประชาสัมพันธ์อย่างเป็นระบบ</p>
      </div>
      <span className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">{canDirector?"สิทธิ์ ผอ. / ผู้ดูแล":"สิทธิ์หัวหน้ากลุ่มงาน"}</span>
    </header>
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      {[
        {label:canDirector?"รอหัวหน้าเกษียณต่อ":"รอดำเนินการ",value:canDirector?directorProgress.pending:headPending.length,icon:"◷",color:"text-blue-700 bg-blue-50"},
        {label:canDirector?"หัวหน้าเกษียณแล้ว":"เกษียณแล้ว",value:canDirector?directorProgress.completed:headDone.length,icon:"✓",color:"text-emerald-700 bg-emerald-50"}
      ].map(stat=><div key={stat.label} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <span className={"hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold sm:flex "+stat.color}>{stat.icon}</span>
        <div className="min-w-0"><p className="text-[11px] font-medium leading-snug text-slate-500 sm:text-xs">{stat.label}</p>
          <p className="mt-0.5 text-xl font-extrabold tabular-nums text-slate-800 sm:text-2xl">{stat.value}</p></div>
      </div>)}
    </div>
    {canDirector&&<p className="text-xs text-slate-500">นับตามภาระงานของหัวหน้ากลุ่มที่ได้รับหนังสือ (ไม่นับงานที่มอบหมายตรงถึงครู)</p>}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2"><div>
            <h3 className="text-base font-extrabold text-slate-800">รายการหนังสือ</h3>
            <p className="text-xs text-slate-500">เลือกหนังสือเพื่อเกษียณและดำเนินการต่อ</p>
          </div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{display.length} เรื่อง</span></div>
          {!canDirector&&<div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="สถานะการเกษียณของหัวหน้า">
            <button type="button" role="tab" aria-selected={headTab==="pending"} onClick={()=>switchHeadTab("pending")}
              className={"min-w-0 flex-1 rounded-lg px-2 py-2 text-xs font-bold sm:text-sm "+(headTab==="pending"?"bg-white text-blue-800 shadow-sm":"text-slate-500 hover:bg-white/70")}>รอเกษียณต่อ ({headPending.length})</button>
            <button type="button" role="tab" aria-selected={headTab==="completed"} onClick={()=>switchHeadTab("completed")}
              className={"min-w-0 flex-1 rounded-lg px-2 py-2 text-xs font-bold sm:text-sm "+(headTab==="completed"?"bg-white text-blue-800 shadow-sm":"text-slate-500 hover:bg-white/70")}>เกษียณแล้ว ({headDone.length})</button>
          </div>}
          <input type="search" value={bookSearch} onChange={e=>setBookSearch(e.target.value)} aria-label="ค้นหาหนังสือ"
            placeholder="ค้นหาเลขรับหรือชื่อเรื่อง..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"/>
        </div>
        <div className="max-h-[680px] space-y-2 overflow-y-auto p-3 sm:p-4">
          {filteredDisplay.map(d=><button type="button" key={d.id} onClick={()=>selectBook(d.id)}
            aria-current={doc?.id===d.id?"true":undefined}
            className={"w-full rounded-xl border p-3.5 text-left transition-colors sm:p-4 "+(doc?.id===d.id?"border-blue-300 bg-blue-50 shadow-[inset_3px_0_0_#3b82f6]":"border-transparent bg-white hover:border-slate-200 hover:bg-slate-50")}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-extrabold text-blue-700">เลขรับ {formatIncomingReceiptNumber(d.docNumber,"—")}</span><span className="text-slate-400">{d.date||""}</span></div>
            <p className="mt-2 line-clamp-2 break-words text-sm font-bold leading-relaxed text-slate-800">{d.subject}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">{d.status}</span>
              {d.urgency&&d.urgency!=="ปกติ"&&<span className={"rounded-md px-2 py-1 text-[11px] font-bold "+(d.urgency==="ด่วนที่สุด"?"bg-red-100 text-red-700":"bg-orange-100 text-orange-700")}>{d.urgency}</span>}
              {!canDirector&&<span className="text-[11px] text-slate-500">กลุ่ม: {activeHeadRows.filter(x=>x.doc.id===d.id).map(x=>x.group).join(", ")}</span>}
            </div>
          </button>)}
          {!filteredDisplay.length&&<p className="rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">{display.length?"ไม่พบหนังสือที่ค้นหา":canDirector?"ไม่มีหนังสือเข้าที่สามารถเกษียณต่อได้":headTab==="pending"?"ไม่มีหนังสือรอเกษียณต่อแล้ว":"ยังไม่มีหนังสือที่เกษียณแล้ว"}</p>}
        </div>
      </section>
      {doc&&<section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600">รายละเอียดหนังสือที่เลือก</p>
          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">{doc.status}</span>
        </div>
        <h3 className="mt-2 break-words text-lg font-extrabold leading-relaxed text-slate-900">{doc.subject}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">เลขรับ {formatIncomingReceiptNumber(doc.docNumber,"—")} • {doc.date||"ไม่ระบุวันที่"} • หนังสือเข้า</p>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-sm font-extrabold text-slate-800">ข้อสั่งการจากผู้อำนวยการ</p>
          <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-sm leading-relaxed text-slate-700">
            {directive||"ไม่มีข้อความข้อสั่งการเพิ่มเติม"}
          </div>
          <button type="button" onClick={()=>onOpen(doc.id)} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50">
            <span aria-hidden="true">↗</span> เปิดดูเอกสารและข้อเกษียณ
          </button>
          <p className="mt-1.5 text-[11px] text-slate-500">ดูไฟล์หนังสือเข้า ประวัติข้อเกษียณ และผู้รับทราบในหน้ารายละเอียดเดิม (ไม่มีไฟล์ลงนามของ ผอ.)</p>
        </div>
        {!canDirector&&<div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-sm font-extrabold text-slate-800">ดำเนินการในฐานะหัวหน้ากลุ่ม</p>
          {myGroup.length===1?<div className="mt-2 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 font-bold text-emerald-700" aria-hidden="true">✓</span>
            <div className="min-w-0"><p className="break-words text-sm font-bold text-emerald-900">{group}</p><p className="text-xs text-emerald-700">ระบบระบุกลุ่มงานให้อัตโนมัติ</p></div>
          </div>:<label className="mt-2 block space-y-1">
            <span className="text-xs font-semibold text-slate-600">หนังสือถึงหลายกลุ่ม กรุณาเลือกฐานะที่ต้องการเกษียณ</span>
            <select value={group} onChange={e=>{setActiveGroup(e.target.value);setIds([]);setBroadcastAllTeachers(false);setMessage("");setConfirm(false)}} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <option value="">— เลือกกลุ่มที่รับหนังสือ —</option>
              {myGroup.map(x=><option key={x.group} value={x.group}>{x.group}</option>)}
            </select>
          </label>}
        </div>}
        {(!canDirector&&completed)&&<div className="mt-4 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-extrabold">เกษียณแล้ว {completed.at?new Date(completed.at).toLocaleString("th-TH"):""}</p>
          <p>ข้อเกษียณล่าสุด: {completed.message||"รับทราบแล้ว"}</p>
          <p>ผู้รับเดิม: {completed.broadcastAllTeachers?"ประชาสัมพันธ์ครูทุกคน":(completed.userIds||[]).map(id=>dbUsers.find(u=>u.id===id)?.name||id).join(", ")||"หัวหน้ารับทราบเอง"}</p>
          {completed.broadcastAllTeachers&&<p>การเปลี่ยนภายหลังจะไม่เรียกคืนสิทธิ์อ่านจากครูที่ได้รับหนังสือไปแล้ว</p>}
        </div>}
        {canDirector&&directorAssignable.length>0&&<label className="mt-4 block space-y-1">
          <span className="text-xs font-bold text-slate-700">เปลี่ยนผู้รับเดิม (ไม่บังคับ)</span>
          <select value={supersedes} onChange={e=>{setSupersedes(e.target.value);setConfirm(false)}} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <option value="">เกษียณ/มอบหมายใหม่ ไม่แทนรายการเดิม</option>
            {directorAssignable.map(e=><option key={e.id} value={e.id}>แทนรายการ {new Date(e.at||0).toLocaleString("th-TH")} — {(e.userIds||[]).map(id=>dbUsers.find(u=>u.id===id)?.name||id).join(", ")}</option>)}
          </select>
          {supersedes&&<p className="text-[11px] text-amber-700">การเปลี่ยนผู้รับเดิมต้องเลือกครูรายบุคคลอย่างน้อยหนึ่งคน</p>}
        </label>}
        {(canDirector||group)&&<div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-sm font-extrabold text-slate-800">{canDirector?"ต้องการเกษียณหรือมอบหมายอย่างไร?":"ต้องการดำเนินการอย่างไร?"}</p>
          <div className={"mt-3 grid gap-2 "+(actions.length===2?"grid-cols-2":"grid-cols-3")} role="group" aria-label="เลือกวิธีดำเนินการ">
            {actions.map(action=><button type="button" key={action.id} aria-pressed={choice===action.id}
              onClick={()=>chooseAction(action.id)} className={"flex min-w-0 flex-col items-center justify-center gap-2 rounded-xl border p-2.5 text-center transition-colors sm:min-h-[93px] sm:p-3 "+(choice===action.id?"border-blue-500 bg-blue-50 text-blue-800 shadow-sm":"border-slate-200 bg-white text-slate-600 hover:bg-blue-50")}>
              <span className="text-xl font-extrabold" aria-hidden="true">{action.icon}</span>
              <span className="text-xs font-bold leading-snug sm:text-sm">{action.name}</span>
              <span className="hidden text-[10px] leading-snug opacity-80 sm:block">{action.hint}</span>
            </button>)}
          </div>
          <div className="mt-3 space-y-3">
            {canDirector&&choice==="director-groups"&&<div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <RoutingPicker dbUsers={dbUsers} systemSettings={systemSettings} groups={groups} setGroups={value=>{setGroups(value);setConfirm(false)}} userIds={ids} setUserIds={value=>{setIds(value);setConfirm(false)}}/>
            </div>}
            {(choice==="director-teachers"||choice==="head-teachers")&&<TeacherDirectoryPicker key={String(doc.id)+":"+group+":"+choice} users={candidates} systemSettings={systemSettings}
              restrictedSubject={!canDirector&&kind==="subject"?group:""} selected={ids} onChange={next=>{setIds(next);setConfirm(false)}}/>}
            {(choice==="director-all"||choice==="head-broadcast")&&<div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-relaxed text-blue-900">
              <p className="font-extrabold">{canDirector?"แจ้งผู้รับหนังสือทุกคน":"ประชาสัมพันธ์ถึงครูทุกคน"}</p>
              <p className="mt-1">{canDirector?"ส่งหนังสือถึงครูและบุคลากรที่เปิดใช้งานตามสิทธิ์ของระบบ":"เพิ่มครูทุกคนที่เปิดใช้งานเป็นผู้รับหนังสือเพื่ออ่านและกดรับทราบ ไม่สร้างงานมอบหมายรายบุคคล"}</p>
              <p className="mt-1 text-xs font-semibold text-amber-800">ตรวจสอบว่าไม่มีข้อมูลจำกัดเฉพาะกลุ่มก่อนยืนยัน</p>
            </div>}
            {choice==="head-ack"&&!canDirector&&<p className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">รับทราบหนังสือในฐานะหัวหน้ากลุ่ม และจบงานของกลุ่มนี้โดยไม่มอบหมายรายบุคคล</p>}
            {canDirector&&!all&&(groups.length>0||ids.length>0)&&<p className="rounded-xl border border-blue-100 bg-blue-50 p-2.5 text-xs text-blue-800">รายการผู้รับที่เลือกไว้ {groups.length} กลุ่ม / {ids.length} คน — สามารถสลับระหว่างมอบหมายกลุ่มกับมอบหมายครูเพื่อเลือกเพิ่มเติมได้</p>}
          </div>
        </div>}
        {(canDirector||group)&&<div className="mt-5 border-t border-slate-100 pt-4">
          <label htmlFor="head-routing-message" className="block text-sm font-extrabold text-slate-800">ข้อเกษียณ / ข้อสั่งการ</label>
          <textarea id="head-routing-message" value={message} onChange={e=>{setMessage(e.target.value);setConfirm(false)}} rows={3}
            className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400" placeholder="บันทึกข้อสั่งการตามหนังสือ..."/>
        </div>}
        {confirm&&<div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-extrabold">ตรวจสอบก่อนยืนยัน</p>
          <p className="mt-1">หนังสือ: {doc.subject}</p>
          <p>ฐานะ/กลุ่ม: {canDirector?(all?"ทุกคน":groups.join(", ")||"ผู้รับรายบุคคล"):group}</p>
          <p>วิธีดำเนินการ: {actions.find(x=>x.id===choice)?.name||"—"}</p>
          <p>ถึงครู: {choice==="head-broadcast"?"ประชาสัมพันธ์ครูทุกคน (ไม่มีงานมอบหมาย)":all?"ทุกคน":chosenRecipientNames.join(", ")||"ไม่มอบหมายรายบุคคล"}</p>
          <p>ข้อสั่งการ: {message||"—"}</p>
          <button type="button" onClick={()=>setConfirm(false)} className="mt-2 text-xs font-bold text-blue-700 underline">กลับไปแก้ไข</button>
        </div>}
        {(canDirector||group)&&<button type="button" disabled={unableToSave} onClick={save}
          className="mt-4 w-full rounded-xl bg-[#174A7E] px-4 py-3.5 text-sm font-extrabold text-white shadow-sm hover:bg-[#103658] disabled:cursor-not-allowed disabled:opacity-50">
          {busy?"กำลังบันทึก...":confirm?"ยืนยันและบันทึก":completed||supersedes?"ตรวจสอบการเปลี่ยนผู้รับ":"ตรวจสอบก่อนบันทึก"}
        </button>}
      </section>}
    </div>
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
  const entries=[...(doc.history||[]).map(h=>({id:h.timestamp||h.time,actor:h.byName||h.role||"ระบบ",desc:h.action+(h.detail&&h.detail!=="-"?" — "+h.detail:""),date:h.timestamp||h.time})),...(doc.routingEntries||[]).map(e=>({id:e.id,actor:e.byName||"ผู้อำนวยการ",desc:"เกษียณ: "+(e.message||"แจ้งเพื่อทราบ"),date:e.at})),...(doc.headActions||[]).map(e=>({id:e.id,actor:e.byName||"หัวหน้ากลุ่ม",desc:e.group+" — "+(e.broadcastAllTeachers?"ประชาสัมพันธ์ครูทุกคน":e.userIds?.length?"มอบหมายให้ "+e.userIds.length+" คน":"รับทราบ")+" "+(e.message||""),date:e.at}))].sort((a,b)=>(b.date||0)-(a.date||0));
  const latestDirective=[...(doc.routingEntries||[]),...(doc.headActions||[])].sort((a,b)=>(b.at||0)-(a.at||0))[0];
  const last=latestDirective?{actor:latestDirective.byName||"ผู้เกษียณ",desc:latestDirective.message||"แจ้งเพื่อทราบ",date:latestDirective.at}:entries[0];
  const files=[...(doc.signedFiles?.length?doc.signedFiles:doc.files||[]),...(doc.extraAttachments||[])];
  async function act(fn){setBusy(true);try{await fn()}finally{setBusy(false)}}
  const copyLink=()=>{const u=new URL(window.location.href);u.searchParams.set("doc",doc.id);navigator.clipboard.writeText(u.toString());};
  if(!canRead)return <div className="bhs-modern-panel p-8">คุณไม่มีสิทธิ์ดูเอกสารนี้</div>;
  return <div className="max-w-5xl mx-auto space-y-4">
    <div className="flex flex-wrap gap-2 justify-between items-center"><button className="text-sm text-blue-700 font-semibold" onClick={()=>onBack()}>← กลับ</button><div className="flex flex-wrap gap-2"><button onClick={copyLink} className="bhs-modern-outline">คัดลอกลิงก์เอกสาร</button>{idx>=0&&idx<visible.length-1&&<button className="bhs-modern-outline" onClick={()=>onBack(visible[idx+1].id)}>เอกสารถัดไป →</button>}</div></div>
    <header className="bhs-modern-panel p-5 space-y-2"><p className="text-xs font-bold text-blue-700">{formatDocumentNumber(doc,doc.type)}</p><h2 className="text-xl md:text-2xl font-bold text-slate-800">{doc.subject}</h2><p className="text-sm text-slate-500">{doc.type} · {doc.status} · ไฟล์แนบ {files.length} ไฟล์</p></header>
    {last&&<div className="rounded-xl p-4 bg-blue-50 border border-blue-100"><b className="text-blue-800 text-sm">ข้อสั่งการ / ประวัติล่าสุด</b><div className="text-sm mt-2">{last.desc}</div><div className="text-xs text-slate-500 mt-1">{last.actor} · {last.date?new Date(last.date).toLocaleString("th-TH"):""}</div></div>}
    <div className="flex flex-wrap gap-2">
      {target&&!acked&&isFinalDoc(doc)&&<button disabled={busy} onClick={()=>act(()=>onAcknowledge(doc))} className="bg-emerald-700 text-white rounded-xl px-4 py-2 text-sm font-bold">รับทราบหนังสือ</button>}
      {target&&!acked&&isFinalDoc(doc)&&nextUnread&&<button disabled={busy} onClick={()=>act(async()=>{await onAcknowledge(doc);onBack(nextUnread.id)})} className="bhs-modern-outline">รับทราบและเปิดหนังสือถัดไป →</button>}
      {assigned.map(e=><button key={e.id} disabled={busy} onClick={()=>act(()=>onAcknowledgeAssignment(doc,e))} className="bg-blue-700 text-white rounded-xl px-4 py-2 text-sm font-bold">รับทราบงานมอบหมาย · {e.kind==="director"?"จาก ผอ.":"จากหัวหน้า"}</button>)}
      {isRoutingEligibleDoc(doc)&&(["director","admin"].includes(currentUser.role)||pendingHeadGroups(doc,currentUser,systemSettings).length>0)&&<button onClick={()=>onOpenRouting(doc.id)} className="bhs-modern-outline">เกษียณ / มอบหมายต่อ</button>}
    </div>
    <div className="flex gap-1 border-b border-slate-200">{[["document","เอกสาร"],["timeline","Timeline"],["recipients","ผู้รับ/การรับทราบ"]].map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={"px-4 py-3 text-sm font-semibold border-b-2 "+(tab===id?"border-blue-600 text-blue-700":"border-transparent text-slate-500")}>{label}</button>)}</div>
    {tab==="document"&&<div className="bhs-modern-panel p-4 space-y-3"><h3 className="font-bold text-sm">ไฟล์ต้นฉบับและไฟล์ประกอบ</h3>{files.map((f,i)=><div key={i} className="space-y-2 border-b py-2"><a href={f.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-700 underline">{f.name||"ไฟล์แนบ "+(i+1)}</a>{(f.name||"").toLowerCase().endsWith(".pdf")&&<div className="w-full max-w-[794px] aspect-[210/297] min-h-[500px] sm:min-h-[800px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 mx-auto">
          <iframe title={f.name||"PDF"} src={f.driveId?"https://drive.google.com/file/d/"+encodeURIComponent(f.driveId)+"/preview":f.url} className="block w-full h-full" loading="lazy"/>
        </div>}</div>)}{!files.length&&<p className="text-sm text-slate-500">ไม่มีไฟล์แนบ</p>}</div>}
    {tab==="timeline"&&<div className="bhs-modern-panel p-5 space-y-5">{entries.map((e,i)=><EventLine key={e.id||i} actor={e.actor} desc={e.desc} date={e.date}/>)}{!entries.length&&<p className="text-sm text-slate-500">ยังไม่มีประวัติ</p>}</div>}
    {tab==="recipients"&&<div className="bhs-modern-panel p-5 space-y-2"><p className="text-sm text-slate-600">ผู้รับ {recipients.length} คน · รับทราบแล้ว {recipients.filter(r=>(doc.acknowledgedBy||[]).includes(r.id)).length} คน</p>{recipients.map(r=><div key={r.id} className="text-sm flex justify-between border-b py-2 gap-2"><span>{r.name}</span><span className={(doc.acknowledgedBy||[]).includes(r.id)?"text-emerald-700":"text-amber-700"}>{(doc.acknowledgedBy||[]).includes(r.id)?"รับทราบแล้ว":"ยังไม่รับทราบ"}</span></div>)}</div>}
  </div>;
}
