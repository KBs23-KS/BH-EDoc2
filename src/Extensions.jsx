import React,{useState} from 'react';
import {matchingDocs,docYear,canReadDoc,canViewPending,pendingAgeDays,recipientsOf,URGENCY,sortUrgency,quarterlySeries} from './workflow';
import {exportPdf,exportXlsx} from './reportExport';
const kinds=['หนังสือเข้า','เลขคำสั่งโรงเรียน','คำสั่งโรงเรียน','ขอเลขที่หนังสือออก','หนังสือเวียนแจ้งรับทราบ'];
const statuses=['รอรองผู้อำนวยการ','รอผู้อำนวยการ','ส่งกลับแก้ไข','อนุมัติ/สั่งการแล้ว','เผยแพร่แล้ว'];
const cn='w-full border border-slate-300 rounded p-2 text-sm bg-white';
const heading='text-xl font-bold text-[#003366]';
const amount=(n)=>Number(n||0).toLocaleString('th-TH');
const years=Array.from({length:10},(_,i)=>String(new Date().getFullYear()+543-i));
function filters({year,setYear,type,setType,status,setStatus,q,setQ}) {return null;}
export function SearchCenter({documents,orderReservations=[],outgoingReservations=[],currentUser,dbUsers,changeMenu}) {
  const [q,setQ]=useState(''),[year,setYear]=useState(''),[type,setType]=useState(''),[status,setStatus]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[page,setPage]=useState(1);
  const reserveRows=[...orderReservations.map(r=>({...r,type:'เลขคำสั่งโรงเรียน',docNumber:r.orderNumber,date:r.orderDate})),...outgoingReservations.map(r=>({...r,type:'ขอเลขที่หนังสือออก',docNumber:r.docNumber||r.outgoingNumber||r.number,date:r.docDate||r.outgoingDate||r.date}))].filter(r=>currentUser.role==='admin'||r.createdBy===currentUser.id);
  const all=[...documents.filter(d=>canReadDoc(currentUser,d,dbUsers)),...reserveRows];
  const found=matchingDocs(all,{q,year,type,status,start:from,end:to}).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const reset=()=>setPage(1);const shown=found.slice((page-1)*20,page*20);
  return <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm space-y-4">
    <h2 className={heading}>ค้นหาเอกสารทุกทะเบียน</h2>
    <p className="text-xs text-amber-800">ค้นจากข้อมูลทะเบียนและผลที่มีสิทธิ์เห็นเท่านั้น (เวอร์ชันนี้ยังโหลดรายการส่วนกลางก่อนค้นหา; อยู่ระหว่างพัฒนา query ฝั่ง Firestore ตามข้อ 15)</p>
    <input className={cn} value={q} onChange={e=>{setQ(e.target.value);reset()}} placeholder="ชื่อเรื่อง เลขที่เอกสาร หน่วยงาน หรือชื่อผู้รับผิดชอบ"/>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <select className={cn} value={type} onChange={e=>{setType(e.target.value);reset()}}><option value="">ทุกประเภท</option>{kinds.map(x=><option key={x}>{x}</option>)}</select>
      <select className={cn} value={year} onChange={e=>{setYear(e.target.value);reset()}}><option value="">ทุกปี พ.ศ.</option>{years.map(y=><option key={y}>{y}</option>)}</select>
      <select className={cn} value={status} onChange={e=>{setStatus(e.target.value);reset()}}><option value="">ทุกสถานะ</option>{statuses.map(x=><option key={x}>{x}</option>)}</select>
      <label className="text-xs">ตั้งแต่วันที่<input className={cn} type="date" value={from} onChange={e=>{setFrom(e.target.value);reset()}}/></label>
      <label className="text-xs">ถึงวันที่<input className={cn} type="date" value={to} onChange={e=>{setTo(e.target.value);reset()}}/></label>
    </div>
    <p className="text-sm text-gray-500">พบ {amount(found.length)} รายการ</p>
    {shown.map(d=><div className="border rounded-lg p-3 space-y-1" key={`${d.type}-${d.id}`}>
      <div className="flex justify-between gap-3"><b className="text-sm">{d.subject}</b><span className="text-xs text-gray-500 shrink-0">{d.docNumber||'-'}</span></div>
      <p className="text-xs text-gray-500">{d.type} | {d.date||'-'} | {d.status||'-'}</p>
      {d.files?.[0]?.url ? <a href={d.files[0].url} rel="noreferrer" target="_blank" className="text-blue-700 text-xs underline">เปิดเอกสาร</a> : <span className="text-gray-400 text-xs">รายการทะเบียน</span>}
    </div>)}
    <div className="flex items-center justify-between gap-2 text-sm"><button className="border rounded px-3 py-2 disabled:opacity-40" disabled={page===1} onClick={()=>setPage(n=>n-1)}>ก่อนหน้า</button><span>หน้า {page}/{Math.max(1,Math.ceil(found.length/20))}</span><button className="border rounded px-3 py-2 disabled:opacity-40" disabled={page>=Math.ceil(found.length/20)} onClick={()=>setPage(n=>n+1)}>ถัดไป</button></div>
  </div>;
}
export function PendingReport({documents,currentUser}) {
  const [status,setStatus]=useState(''),[sort,setSort]=useState('age');
  const docs=documents.filter(d=>canViewPending(currentUser,d)).filter(d=>!status||d.status===status).sort((a,b)=>sort==='age'?pendingAgeDays(b)-pendingAgeDays(a):(b.createdAt||0)-(a.createdAt||0));
  return <div className="bg-white rounded-xl shadow p-5 space-y-4"><h2 className={heading}>ติดตามเอกสารค้างดำเนินการ</h2>
    <p className="text-sm text-gray-500">รายการที่ต้องดำเนินการ {amount(docs.length)} รายการ — ระยะเวลาเริ่มนับตั้งแต่เข้าสู่ขั้นตอนปัจจุบัน</p>
    <div className="flex gap-2"><select className={cn} value={status} onChange={e=>setStatus(e.target.value)}><option value="">ทุกสถานะที่ค้าง</option>{statuses.slice(0,3).map(x=><option key={x}>{x}</option>)}</select><select className={cn} value={sort} onChange={e=>setSort(e.target.value)}><option value="age">ค้างนานสุดก่อน</option><option value="recent">สร้างล่าสุดก่อน</option></select></div>
    {docs.map(d=><div key={d.id} className="border p-3 rounded-lg"><b className="text-sm">{d.docNumber||'-'} — {d.subject}</b><p className="text-xs text-gray-600">{d.status} | รอ {pendingAgeDays(d)} วัน | {d.status==='ส่งกลับแก้ไข'?'ผู้สร้างเอกสาร':d.status==='รอผู้อำนวยการ'?'ผู้อำนวยการ':'รองผู้อำนวยการ'}</p>{d.files?.[0]?.url && <a className="text-xs underline text-blue-700" href={d.files[0].url} target="_blank" rel="noreferrer">เปิด PDF</a>}</div>)}
    {!docs.length&&<p className="text-sm text-gray-500">ไม่มีรายการค้างในขอบเขตที่มีสิทธิ์เห็น</p>}
  </div>;
}
export function AckReport({documents,currentUser,dbUsers,onReminder,onAddRecipient}) {
  const [id,setId]=useState(''),[show,setShow]=useState('pending'),[sending,setSending]=useState(false);
  const [newRecipient,setNewRecipient]=useState(''),[reason,setReason]=useState('');
  const accessible=documents.filter(d=>['เผยแพร่แล้ว','อนุมัติ/สั่งการแล้ว'].includes(d.status)&&canReadDoc(currentUser,d,dbUsers));
  const doc=accessible.find(d=>d.id===id)||accessible[0];const people=doc?recipientsOf(doc,dbUsers):[];
  const done=new Set(doc?.acknowledgedBy||[]),visible=people.filter(p=>show==='all'||(show==='done'?done.has(p.id):!done.has(p.id)));
  const mayRemind=['admin','director','deputy'].includes(currentUser.role);
  return <div className="bg-white rounded-xl shadow p-5 space-y-4"><h2 className={heading}>รายงานผู้รับทราบเอกสาร</h2>
    <select className={cn} value={doc?.id||''} onChange={e=>setId(e.target.value)}>{accessible.map(d=><option key={d.id} value={d.id}>{d.docNumber||'-'} — {d.subject}</option>)}</select>
    {doc&&<><div className="grid grid-cols-3 gap-2 text-center text-sm"><div className="bg-slate-100 p-2 rounded">ทั้งหมด<br/><b>{people.length}</b></div><div className="bg-green-50 p-2 rounded">รับทราบ<br/><b>{people.filter(p=>done.has(p.id)).length}</b></div><div className="bg-amber-50 p-2 rounded">ค้าง<br/><b>{people.filter(p=>!done.has(p.id)).length}</b></div></div>
      <select className={cn} value={show} onChange={e=>setShow(e.target.value)}><option value="pending">ยังไม่รับทราบ</option><option value="done">รับทราบแล้ว</option><option value="all">ทั้งหมด</option></select>
      {visible.map(p=><div key={p.id} className="border rounded p-2 text-sm flex justify-between items-center gap-2"><div><b>{p.name}</b><p className="text-xs text-gray-500">{done.has(p.id)?`รับทราบแล้ว ${doc.acknowledgedAt?.[p.id]?new Date(doc.acknowledgedAt[p.id]).toLocaleString('th-TH'):''}`:'ยังไม่รับทราบ'}</p></div>{mayRemind&&!done.has(p.id)&&<button disabled={sending} onClick={async()=>{setSending(true);try{await onReminder(doc,p)}finally{setSending(false)}}} className="text-xs bg-blue-700 text-white px-3 py-2 rounded disabled:opacity-50">แจ้งเตือนซ้ำ</button>}</div>)}
      {mayRemind&&Array.isArray(doc.recipientsSnapshot)&&<div className="border-t pt-3 space-y-2">
        <p className="font-bold text-sm">เพิ่มผู้รับภายหลังการเผยแพร่</p>
        <select className={cn} value={newRecipient} onChange={e=>setNewRecipient(e.target.value)}><option value="">เลือกผู้รับเพิ่มเติม</option>
          {dbUsers.filter(u=>['teacher','clerk'].includes(u.role)&&u.status!=='inactive'&&!people.some(p=>p.id===u.id)).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input className={cn} placeholder="เหตุผลที่เพิ่มผู้รับ" value={reason} onChange={e=>setReason(e.target.value)}/>
        <button disabled={sending||!newRecipient||!reason.trim()} className="bg-blue-800 text-white rounded p-2 text-xs disabled:opacity-40" onClick={async()=>{setSending(true);try{await onAddRecipient(doc,newRecipient,reason);setNewRecipient('');setReason('')}finally{setSending(false)}}}>บันทึกผู้รับเพิ่มเติม</button>
      </div>}
      {!Array.isArray(doc.recipientsSnapshot)&&<p className="text-xs text-amber-700">เอกสารเก่ายังไม่มีรายชื่อผู้รับ ณ วันเผยแพร่ ระบบแสดงจากรายชื่อปัจจุบันเป็นการชั่วคราว</p>}
    </>}
  </div>;
}
export function ExportRegisters({documents,orderReservations=[],outgoingReservations=[],currentUser,dbUsers,showToast}) {
  const [type,setType]=useState(''),[year,setYear]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  const reserved=[...orderReservations.map(r=>({...r,type:'เลขคำสั่งโรงเรียน',docNumber:r.orderNumber,date:r.orderDate})),...outgoingReservations.map(r=>({...r,type:'ขอเลขที่หนังสือออก',docNumber:r.docNumber||r.outgoingNumber||r.number,date:r.docDate||r.outgoingDate||r.date}))].filter(r=>currentUser.role==='admin'||r.createdBy===currentUser.id);
  const docs=matchingDocs([...documents.filter(d=>canReadDoc(currentUser,d,dbUsers)),...reserved],{type,year,start:from,end:to,status});
  const go=async format=>{setBusy(true);try{const fn=`BHS-register-${type||'all'}-${year||'all'}`;await (format==='xlsx'?exportXlsx(docs,fn):exportPdf(docs,fn));showToast('ส่งออกรายงานสำเร็จ','success')}catch(e){showToast(`ส่งออกไม่สำเร็จ: ${e.message}`,'error')}finally{setBusy(false)}};
  return <div className="bg-white rounded-xl shadow p-5 space-y-4"><h2 className={heading}>ส่งออกทะเบียน Excel / PDF</h2>
    <div className="grid md:grid-cols-2 gap-3"><select className={cn} value={type} onChange={e=>setType(e.target.value)}><option value="">ทุกทะเบียน</option>{kinds.map(x=><option key={x}>{x}</option>)}</select><select className={cn} value={year} onChange={e=>setYear(e.target.value)}><option value="">ทุกปี พ.ศ.</option>{years.map(y=><option key={y}>{y}</option>)}</select><label className="text-xs">ตั้งแต่<input className={cn} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-xs">ถึง<input className={cn} type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><select className={cn} value={status} onChange={e=>setStatus(e.target.value)}><option value="">ทุกสถานะ</option>{statuses.map(x=><option key={x}>{x}</option>)}</select></div>
    <p className="text-sm">ข้อมูลที่ตรงตัวกรอง {amount(docs.length)} รายการ (ไม่จำกัดหน้าตาราง)</p><div className="flex gap-3"><button disabled={busy} onClick={()=>go('xlsx')} className="bg-emerald-700 text-white rounded p-3 disabled:opacity-50">ส่งออก Excel .xlsx</button><button disabled={busy} onClick={()=>go('pdf')} className="bg-blue-800 text-white rounded p-3 disabled:opacity-50">ส่งออก PDF .pdf</button></div>
    <p className="text-xs text-amber-800">รุ่นนี้ใช้ข้อมูลที่โหลดเข้าแอปแล้ว การส่งออกครบทุกหน้าบนฐานข้อมูลขนาดใหญ่ต้องทำต่อหลังปรับ query ฝั่ง Firestore ในข้อ 15</p>
  </div>;
}
export function StatsDashboard({documents,currentUser,dbUsers,changeMenu}) {
  const [year,setYear]=useState(String(new Date().getFullYear()+543));
  const [month,setMonth]=useState('');
  const allowed=documents.filter(d=>canReadDoc(currentUser,d,dbUsers));
  const docs=allowed.filter(d=>docYear(d)===Number(year)&&(!month||Number(String(d.date||'').slice(5,7))===Number(month)));
  const pending=documents.filter(d=>canViewPending(currentUser,d));
  const incoming=docs.filter(d=>d.type==='หนังสือเข้า'),orders=docs.filter(d=>d.type==='คำสั่งโรงเรียน'&&d.status==='เผยแพร่แล้ว'),circulars=docs.filter(d=>d.type==='หนังสือเวียนแจ้งรับทราบ');
  const series=quarterlySeries(allowed,year,'หนังสือเข้า');const max=Math.max(1,...series.map(x=>x.count));
  const urgent=sortUrgency(pending.filter(d=>URGENCY[d.urgency]>1));
  return <div className="space-y-4"><div className="flex justify-between items-center gap-3"><h2 className={heading}>ภาพรวมงานสารบรรณ</h2><div className="flex gap-2"><select className="border rounded p-2 text-sm" value={year} onChange={e=>setYear(e.target.value)}>{years.map(y=><option key={y}>{y}</option>)}</select><select className="border rounded p-2 text-sm" value={month} onChange={e=>setMonth(e.target.value)}><option value="">ทั้งปี</option>{Array.from({length:12},(_,i)=><option key={i+1} value={String(i+1)}>{i+1}</option>)}</select></div></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['หนังสือเข้า',incoming.length],['คำสั่งเผยแพร่',orders.length],['หนังสือเวียน',circulars.length],['งานค้าง',pending.length]].map(([title,n])=><div key={title} className="bg-white rounded-xl p-4 border shadow-sm"><p className="text-sm text-slate-500">{title}</p><p className="text-3xl font-bold">{amount(n)}</p></div>)}</div>
    <div className="bg-white rounded-xl p-4 border"><b>หนังสือเข้ารายเดือน พ.ศ. {year}</b><div className="flex h-48 gap-2 items-end mt-4">{series.map(x=><div key={x.month} className="flex-1 flex flex-col items-center justify-end h-full gap-1"><span className="text-[10px]">{x.count}</span><div className="bg-blue-700 rounded-t w-full min-h-[2px]" style={{height:`${x.count/max*80}%`}}/><span className="text-[10px]">{x.month}</span></div>)}</div></div>
    <div className="bg-white rounded-xl p-4 border space-y-2"><b>งานด่วนที่ยังค้างดำเนินการ</b>{urgent.slice(0,8).map(d=><p key={d.id} className="text-sm border-b py-2"><span className="text-red-700 font-bold">{d.urgency}</span> — {d.subject} ({d.status})</p>)}{!urgent.length&&<p className="text-gray-500 text-sm">ไม่มีงานด่วนที่ค้างดำเนินการ</p>}</div>
    <p className="text-xs text-amber-800">ตัวเลขคำนวณจากรายการที่แอปโหลดและมองเห็นตามสิทธิ์เท่านั้น ยังไม่ใช่ยอดรวมจากการ aggregate บน Firestore</p>
  </div>;
}
