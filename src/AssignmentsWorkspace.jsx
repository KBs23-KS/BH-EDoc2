import React,{useState} from "react";
import {formatDocumentNumber} from "./incomingReceiptDisplay";
import {pendingAssignmentEvents,acknowledgedAssignmentEvents} from "./routing";

/**
 * Keeps already-acknowledged assignment records available for review.
 * Counts refer to assignment events, not an unrelated document-wide receipt.
 */
export default function AssignmentsWorkspace({documents=[],currentUser,onOpen}){
  const [tab,setTab]=useState("pending");
  const toItems=(getEvents)=>documents.flatMap(doc=>getEvents(doc,currentUser).map(event=>({doc,event})))
    .sort((a,b)=>(b.event.at||b.doc.publishedAt||b.doc.createdAt||0)-(a.event.at||a.doc.publishedAt||a.doc.createdAt||0));
  const pending=toItems(pendingAssignmentEvents);
  const completed=toItems(acknowledgedAssignmentEvents);
  const entries=tab==="pending"?pending:completed;
  return <section className="bhs-modern-panel p-4 md:p-5 space-y-4">
    <header className="space-y-1">
      <h2 className="text-xl md:text-2xl font-bold text-slate-800">งานที่ได้รับมอบหมาย</h2>
      <p className="text-sm text-slate-500">รับทราบแล้วจะย้ายไปแท็บย้อนหลังโดยอัตโนมัติ และยังเปิดอ่านหนังสือเดิมได้</p>
    </header>
    <div role="tablist" aria-label="สถานะงานที่ได้รับมอบหมาย" className="flex flex-wrap gap-2">
      <button type="button" role="tab" aria-selected={tab==="pending"} onClick={()=>setTab("pending")}
        className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${tab==="pending"?"bg-[#003366] text-white border-[#003366]":"bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
        ยังไม่รับทราบ ({pending.length})
      </button>
      <button type="button" role="tab" aria-selected={tab==="completed"} onClick={()=>setTab("completed")}
        className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${tab==="completed"?"bg-[#003366] text-white border-[#003366]":"bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
        รับทราบแล้ว ({completed.length})
      </button>
    </div>
    {!entries.length&&<div className="py-10 text-center text-sm text-slate-500">
      {tab==="pending"?"ไม่มีงานมอบหมายที่ยังไม่รับทราบ":"ยังไม่มีงานมอบหมายที่รับทราบแล้ว"}
    </div>}
    <div className="space-y-3">
      {entries.map(({doc,event})=>{
        const allEvents=[...(doc.routingEntries||[]),...(doc.headActions||[])];
        const superseded=allEvents.some(e=>e.supersedes===event.id);
        return <button key={doc.id+":"+event.id} type="button" onClick={()=>onOpen(doc.id)}
          className="w-full text-left border border-slate-200 p-4 rounded-xl hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 transition-colors space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-blue-700">{formatDocumentNumber(doc,doc.type)}</span>
            <span className={`text-xs font-bold rounded-full px-2.5 py-1 ${tab==="pending"?"text-amber-800 bg-amber-50 border border-amber-200":"text-green-800 bg-green-50 border border-green-200"}`}>
              {tab==="pending"?"ยังไม่รับทราบ":"รับทราบแล้ว"}
            </span>
          </div>
          <p className="font-semibold text-sm md:text-base text-slate-800">{doc.subject}</p>
          <p className="text-xs text-slate-600">มอบหมายโดย: {event.byName|| (event.kind==="director"?"ผู้อำนวยการ":"หัวหน้ากลุ่ม")}</p>
          {event.message&&<p className="text-xs text-slate-600 whitespace-pre-wrap">ข้อสั่งการ: {event.message}</p>}
          {superseded&&tab==="completed"&&<p className="text-xs text-amber-700">รายการนี้มีการเปลี่ยนผู้รับมอบหมายภายหลัง แต่เก็บประวัติการรับทราบไว้</p>}
          <p className="text-xs text-blue-700 font-semibold">{tab==="pending"?"เปิดเอกสารและกดรับทราบงาน":"เปิดดูเอกสารและข้อเกษียณย้อนหลัง"}</p>
        </button>;
      })}
    </div>
  </section>;
}
