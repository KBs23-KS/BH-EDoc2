import React, { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument, rgb } from "pdf-lib";
import {readLocalSignaturePdf,signaturePdfNamesMatch} from "./signatureLocalPdf.js";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const fromB64 = b64 => Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
const MAX_EDITOR_BYTES=18*1024*1024;
// Fountain-pen blue; screen rendering and signed PDF use the exact same RGB.
const SIGNATURE_INK="#1E5BD8";
const SIGNATURE_LINE_WIDTH=2.2;
const PDF_SIGNATURE_INK=rgb(30/255,91/255,216/255);
/** The server checks the director's signed session and requested document/Drive ID. */
async function fetchOriginalPdf(document,file,signal){
  if(!file?.driveId)throw new Error("ไฟล์ต้นฉบับไม่มี Drive ID");
  const res=await fetch("/api/signing-pdf",{
    method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({docId:document.id,driveId:file.driveId}),signal
  });
  if(!res.ok){
    let message="บริการเปิด PDF อัตโนมัติยังไม่พร้อม";
    try{message=(await res.json()).error||message;}catch{}
    throw new Error(message);
  }
  const bytes=new Uint8Array(await res.arrayBuffer());
  if(!bytes.length||bytes.length>MAX_EDITOR_BYTES)throw new Error("PDF มีขนาดใหญ่เกินไป");
  return bytes;
}
async function readPdfPages(bytes){
  // Do not eagerly create every page; tablets render only the visible page.
  return pdfjs.getDocument({data:bytes.slice()}).promise;
}

function PdfPage({ page, pageIndex, mode, marks, addMark, stamp }) {
  const base = useRef(null);
  const overlay = useRef(null);
  const currentStroke = useRef(null);
  const [dims, setDims] = useState({width:0,height:0});
  useEffect(() => {
    if (!page || !base.current) return;
    let canceled = false;
    const natural=page.getViewport({scale:1});
    const factor=Math.min(1.15,1200/natural.width,1450/natural.height,Math.sqrt(1400000/(natural.width*natural.height)));
    const viewport=page.getViewport({scale:factor});
    const canvas = base.current;
    canvas.width = Math.max(1,Math.round(viewport.width)); canvas.height=Math.max(1,Math.round(viewport.height));
    const task = page.render({canvasContext:canvas.getContext("2d",{alpha:false}),viewport});
    task.promise.then(()=>{if(!canceled)setDims({width:canvas.width,height:canvas.height});}).catch(()=>{});
    return ()=>{canceled=true;task.cancel();canvas.width=0;canvas.height=0;if(overlay.current){overlay.current.width=0;overlay.current.height=0;}};
  },[page]);
  useEffect(() => {
    const canvas=overlay.current;
    if(!canvas||!dims.width)return;
    canvas.width=dims.width;canvas.height=dims.height;
    const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(const mark of marks){
      if(mark.type==="stroke"){
        ctx.strokeStyle=SIGNATURE_INK;ctx.lineWidth=SIGNATURE_LINE_WIDTH;ctx.lineCap="round";ctx.lineJoin="round";
        ctx.beginPath();
        mark.points.forEach(([x,y],i)=>i?ctx.lineTo(x*canvas.width,y*canvas.height):ctx.moveTo(x*canvas.width,y*canvas.height));
        ctx.stroke();
      }else if(mark.type==="stamp"){
        const img=new Image();img.onload=()=>ctx.drawImage(img,mark.x*canvas.width,mark.y*canvas.height,mark.w*canvas.width,mark.h*canvas.height);
        img.src=mark.image;
      }
    }
  },[dims,marks]);
  const position = e=>{
    const r=e.currentTarget.getBoundingClientRect();
    return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];
  };
  const down=e=>{
    if(mode==="view"||!dims.width)return;
    e.preventDefault();
    const [x,y]=position(e);
    if(mode==="stamp"){
      if(stamp)addMark(pageIndex,{type:"stamp",image:stamp,x:Math.max(0,Math.min(.7,x-.15)),y:Math.max(0,Math.min(.9,y-.05)),w:.3,h:.1});
      return;
    }
    currentStroke.current={id:"stroke-"+Date.now(),points:[[x,y]],pointerId:e.pointerId};
    try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}
  };
  const move=e=>{
    const current=currentStroke.current;
    if(!current||current.pointerId!==e.pointerId||mode!=="pen")return;
    e.preventDefault();
    const point=position(e),previous=current.points.at(-1);
    const canvas=overlay.current,ctx=canvas?.getContext("2d");
    if(ctx&&previous){
      ctx.strokeStyle=SIGNATURE_INK;ctx.lineWidth=SIGNATURE_LINE_WIDTH;ctx.lineCap="round";ctx.lineJoin="round";
      ctx.beginPath();ctx.moveTo(previous[0]*canvas.width,previous[1]*canvas.height);
      ctx.lineTo(point[0]*canvas.width,point[1]*canvas.height);ctx.stroke();
    }
    current.points.push(point);
  };
  const finish=e=>{
    const current=currentStroke.current;
    if(!current||current.pointerId!==e.pointerId)return;
    currentStroke.current=null;
    // React updates once per completed stroke, not on every Pencil move.
    addMark(pageIndex,{type:"stroke",id:current.id,points:current.points});
  };
  return <div className="relative bg-white mx-auto shadow-lg border overflow-hidden" style={{width:dims.width||"auto",maxWidth:"100%"}}>
    <canvas ref={base} className="block w-full h-auto"/>
    <canvas ref={overlay} className="absolute inset-0 w-full h-full"
      style={{touchAction: mode==="view" ? "pan-y" : "none",cursor:mode==="pen"?"crosshair":mode==="stamp"?"copy":"default",pointerEvents:mode==="view"?"none":"auto"}}
      onPointerDown={down} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}/>
    <div className="absolute top-1 left-1 bg-white/80 rounded px-1 text-xs text-gray-500 pointer-events-none">หน้า {pageIndex+1}</div>
  </div>;
}

/** Draw at any position on any PDF page, or click to place an uploaded signature image. */
export function PdfSignatureEditor({ document, onCancel, onSubmit, busy }) {
  const sourceFiles=(document.files||[]).filter(f=>f.driveId && (f.type==="PDF" || f.name?.toLowerCase().endsWith(".pdf")));
  const [fileIndex,setFileIndex]=useState(0);
  const [allSigned,setAllSigned]=useState([]);
  const [sourceBytes,setSourceBytes]=useState(null);
  const [pageCount,setPageCount]=useState(0);
  const [pageIndex,setPageIndex]=useState(0);
  const [activePage,setActivePage]=useState(null);
  const pdfRef=useRef(null);
  const [marks,setMarks]=useState({});
  const [mode,setMode]=useState("view");
  const [stamp,setStamp]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [loadedFromDevice,setLoadedFromDevice]=useState("");
  const loadRequest=useRef(0);
  const releasePdf=()=>{const old=pdfRef.current;pdfRef.current=null;if(old)void old.destroy().catch(()=>{});};
  const acceptPdf=async(bytes,request,label)=>{
    if(bytes.length>MAX_EDITOR_BYTES)throw new Error("PDF เกิน 18 MB ไม่เหมาะกับการลงนามผ่านแท็บเล็ต");
    const pdf=await readPdfPages(bytes);
    if(request!==loadRequest.current){void pdf.destroy();return;}
    releasePdf();pdfRef.current=pdf;
    setSourceBytes(bytes);setPageCount(pdf.numPages);setPageIndex(0);setMarks({});
    setMode("view");setLoadedFromDevice(label);setLoading(false);
  };
  useEffect(()=>{
    let disposed=false;
    const controller=new AbortController(),request=++loadRequest.current;
    releasePdf();setSourceBytes(null);setPageCount(0);setActivePage(null);
    setLoading(true);setError("");setMarks({});setLoadedFromDevice("");
    (async()=>{
      if(!sourceFiles.length)throw new Error("เอกสารนี้ไม่มีไฟล์ PDF ที่ระบบสามารถลงนามได้");
      const bytes=await fetchOriginalPdf(document,sourceFiles[fileIndex],controller.signal);
      if(!disposed)await acceptPdf(bytes,request,"เปิด PDF อัตโนมัติสำเร็จ");
    })().catch(e=>{
      if(!disposed&&request===loadRequest.current){
        setError("ไม่สามารถเปิด PDF อัตโนมัติ: "+String(e?.message||e)+" — สามารถดาวน์โหลดและเลือกไฟล์แทนได้");
        setLoading(false);
      }
    });
    return()=>{disposed=true;controller.abort();loadRequest.current++;releasePdf();};
  },[document.id,fileIndex]);
  useEffect(()=>{
    const pdf=pdfRef.current;
    if(!pdf||!pageCount)return;
    let disposed=false;
    setActivePage(null);
    pdf.getPage(pageIndex+1).then(page=>{if(!disposed)setActivePage(page);})
      .catch(e=>{if(!disposed)setError("อ่านหน้า PDF ไม่สำเร็จ: "+e.message);});
    return()=>{disposed=true;};
  },[pageIndex,pageCount,fileIndex]);
  const loadFromDevice=async event=>{
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    const expected=sourceFiles[fileIndex];
    if(expected?.name&&!signaturePdfNamesMatch(file.name,expected.name)){
      const accepted=window.confirm("ชื่อไฟล์ไม่ตรงต้นฉบับ: "+expected.name+
        "\nเลือก: "+file.name+"\nยืนยันว่าเป็นไฟล์ของเอกสารเดียวกัน?");
      if(!accepted)return;
    }
    const request=++loadRequest.current;
    setLoading(true);setError("");setSourceBytes(null);setPageCount(0);setActivePage(null);releasePdf();
    try{
      if(file.size>MAX_EDITOR_BYTES)throw new Error("PDF ใหญ่เกิน 18 MB สำหรับการลงนามบนแท็บเล็ต");
      const bytes=await readLocalSignaturePdf(file);
      await acceptPdf(bytes,request,file.name);
    }catch(e){if(request===loadRequest.current){setError("เปิด PDF ที่เลือกไม่สำเร็จ: "+String(e?.message||e));setLoading(false);}}
  };
  const addMark=(i,m)=>setMarks(old=>({...old,[i]:[...(old[i]||[]),m]}));
  const undo=()=>setMarks(old=>{const key=Object.keys(old).filter(i=>(old[i]||[]).length).at(-1);if(key===undefined)return old;return {...old,[key]:old[key].slice(0,-1)};});
  const onStampFile=async e=>{
    const file=e.target.files?.[0];e.target.value="";
    if(!file)return;
    if(!file.type.startsWith("image/")||file.size>6*1024*1024){
      setError("กรุณาเลือกรูปลายเซ็นไม่เกิน 6 MB");return;
    }
    let objectUrl;
    try{
      objectUrl=URL.createObjectURL(file);
      const img=new Image();img.src=objectUrl;await img.decode();
      const factor=Math.min(1,1024/img.naturalWidth,1024/img.naturalHeight);
      const canvas=window.document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(img.naturalWidth*factor));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*factor));
      canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
      setStamp(canvas.toDataURL("image/png"));setMode("stamp");setError("");
      canvas.width=0;canvas.height=0;
    }catch(err){setError("ไม่สามารถอ่านรูปลายเซ็น: "+String(err.message||err));}
    finally{if(objectUrl)URL.revokeObjectURL(objectUrl);}
  };
  const saveCurrent=async()=>{
    if (!sourceBytes||!pdfRef.current) return;
    if(!Object.values(marks).flat().length){setError("กรุณาเซ็นหรือแทรกลายเซ็นก่อนบันทึก");return;}
    setSaving(true);setError("");
    try{
      const pdf=await PDFDocument.load(sourceBytes);
      const embeddedStamps=new Map();
      for(const [k,items] of Object.entries(marks)){
        const pg=pdf.getPage(Number(k));const {width,height}=pg.getSize();
        for(const m of items){
          if(m.type==="stroke"){
            const pts=m.points;
            for(let j=1;j<pts.length;j++)pg.drawLine({start:{x:pts[j-1][0]*width,y:(1-pts[j-1][1])*height},end:{x:pts[j][0]*width,y:(1-pts[j][1])*height},thickness:1.35,color:PDF_SIGNATURE_INK});
            if(pts.length===1) pg.drawCircle({x:pts[0][0]*width,y:(1-pts[0][1])*height,size:.75,color:PDF_SIGNATURE_INK});
          }else if(m.type==="stamp"){
            let img=embeddedStamps.get(m.image);
            if(!img){img=await pdf.embedPng(fromB64(m.image.split(",")[1]));embeddedStamps.set(m.image,img);}
            pg.drawImage(img,{x:m.x*width,y:(1-m.y-m.h)*height,width:m.w*width,height:m.h*height});
          }
        }
      }
      const bytes=await pdf.save();
      const original=sourceFiles[fileIndex];
      const file=new File([bytes],`signed-${document.docNumber?.replace("/","-")||document.id}-${fileIndex+1}.pdf`,{type:"application/pdf"});
      const next=[...allSigned,file];
      if(fileIndex<sourceFiles.length-1){setAllSigned(next);setFileIndex(i=>i+1);}
      else await onSubmit(next);
    }catch(e){setError(e.message);}
    finally{setSaving(false);}
  };
  return <div className="fixed inset-0 z-[300] bg-slate-900/95 flex flex-col text-white">
    <div className="flex gap-2 items-center flex-wrap px-3 py-2 bg-slate-800 border-b border-slate-700">
      <b className="mr-auto text-sm">ลงนาม PDF: {document.docNumber||document.subject} ({fileIndex+1}/{sourceFiles.length})</b>
      <button onClick={()=>setMode("view")} className={`px-3 py-2 rounded text-sm ${mode==="view"?"bg-blue-600":"bg-slate-700"}`}>เลื่อนหน้า</button>
      <button onClick={()=>setMode("pen")} className={`px-3 py-2 rounded text-sm ${mode==="pen"?"bg-blue-600":"bg-slate-700"}`}>เขียนลายเซ็น</button>
      <label className="px-3 py-2 bg-slate-700 rounded text-sm cursor-pointer">แทรกรูปลายเซ็น<input type="file" accept="image/*" hidden onChange={onStampFile}/></label>
      {stamp&&<button onClick={()=>setMode("stamp")} className={`px-3 py-2 rounded text-sm ${mode==="stamp"?"bg-blue-600":"bg-slate-700"}`}>วางลายเซ็น</button>}
      <button onClick={undo} className="px-3 py-2 bg-slate-700 rounded text-sm">ย้อนกลับ</button>
      <button disabled={saving||busy||loading||!!error||!sourceBytes} onClick={saveCurrent} className="px-4 py-2 bg-green-700 disabled:opacity-50 rounded font-bold text-sm">{saving||busy?"กำลังบันทึก...":fileIndex<sourceFiles.length-1?"เซ็นไฟล์นี้แล้วไปถัดไป":"บันทึกและอนุมัติ"}</button>
      <button onClick={onCancel} disabled={saving||busy} className="px-3 py-2 bg-red-700 rounded text-sm">ปิด</button>
    </div>
    <div className="overflow-y-auto flex-1 p-4 space-y-4 bg-slate-600">
      <p className="text-center text-xs text-slate-100">เลือก «เลื่อนหน้า» เพื่ออ่าน / «เขียนลายเซ็น» เพื่อใช้ Apple Pencil หรือเมาส์ / «วางลายเซ็น» เพื่อคลิกตำแหน่ง</p>
      {loading&&<p className="text-center py-8">กำลังเปิด PDF อัตโนมัติ...</p>}
      {error&&<div className="bg-red-100 text-red-800 max-w-xl mx-auto rounded p-3">{error}<button onClick={()=>setError("")} className="ml-2 underline">ปิดข้อความ</button></div>}
      {!sourceBytes&&!loading&&sourceFiles[fileIndex]&&<div className="bg-slate-100 text-slate-800 max-w-xl mx-auto rounded-xl p-5 space-y-4">
        <h3 className="font-bold text-lg">เปิดไฟล์ต้นฉบับเพื่อเซ็น</h3>
        <p className="text-sm">ระบบ Google Drive จำกัดการอ่านผ่านเว็บไซต์ แต่ยังเซ็น PDF ได้โดยใช้ต้นฉบับที่ดาวน์โหลดจาก Drive โดยไม่ต้องใช้รหัส Backup ของแอดมิน</p>
        <p className="text-sm">ไฟล์ที่ต้องใช้: <b className="break-all">{sourceFiles[fileIndex].name}</b></p>
        <div className="flex flex-wrap gap-3 items-center">
          <a className="bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-bold" href={`https://drive.google.com/file/d/${encodeURIComponent(sourceFiles[fileIndex].driveId)}/view`} target="_blank" rel="noopener noreferrer">1. เปิด PDF ใน Drive เพื่อดาวน์โหลด</a>
          <label className="bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-bold cursor-pointer">2. เลือก PDF ที่ดาวน์โหลดมา
            <input type="file" accept=".pdf,application/pdf" onChange={loadFromDevice} hidden />
          </label>
        </div>
        <p className="text-xs text-amber-800">ต้องเลือกไฟล์ต้นฉบับของหนังสือฉบับนี้เท่านั้น ข้อมูลในไฟล์ที่เลือกจะถูกใช้สร้างฉบับลงนามและอัปโหลดเมื่อกด “บันทึกและอนุมัติ”</p>
      </div>}
      {loadedFromDevice&&<div className="max-w-xl mx-auto bg-green-100 text-green-900 rounded p-3 text-sm">เปิด PDF จากเครื่องแล้ว: {loadedFromDevice} — พร้อมเขียนหรือวางลายเซ็น</div>}
      {sourceBytes&&<div className="flex items-center justify-center gap-3 text-sm">
        <button className="px-3 py-2 rounded bg-slate-700 disabled:opacity-40" disabled={pageIndex===0} onClick={()=>setPageIndex(i=>i-1)}>หน้าก่อนหน้า</button>
        <span>หน้า {pageIndex+1} / {pageCount}</span>
        <button className="px-3 py-2 rounded bg-slate-700 disabled:opacity-40" disabled={pageIndex>=pageCount-1} onClick={()=>setPageIndex(i=>i+1)}>หน้าถัดไป</button>
      </div>}
      {activePage&&<PdfPage key={fileIndex+"-"+pageIndex} page={activePage} pageIndex={pageIndex} mode={mode} stamp={stamp} marks={marks[pageIndex]||[]} addMark={addMark}/>} 
    </div>
  </div>;
}
