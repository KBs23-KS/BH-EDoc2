import React, { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument, rgb } from "pdf-lib";
import {readLocalSignaturePdf,signaturePdfNamesMatch} from "./signatureLocalPdf.js";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const GAS_URL = "https://script.google.com/macros/s/AKfycbybUep1zqPvNXMaed11u7bibs7SaOWNsfgrpm1d3Wz8jh8eql9ljOU6MyygE2nrPmsIPg/exec";
const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const toDataUrl = file => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file);
});

/** Requires the getFile action in gas/Code.gs to be deployed on the existing Apps Script URL. */
async function fetchOriginalPdf(file) {
  if (!file?.driveId) throw new Error("ไฟล์นี้ไม่มี Drive ID จึงยังเปิดเพื่อเซ็นออนไลน์ไม่ได้");
  const response = await fetch(GAS_URL, {
    method: "POST", body: JSON.stringify({action:"getFile",fileId:file.driveId})
  });
  const json = await response.json();
  if (!json.success || !json.base64) throw new Error(json.error || "บริการ Google Apps Script ยังไม่รองรับการอ่าน PDF");
  return fromB64(json.base64);
}

// The signed bytes can be loaded from Drive (when authorized) or from a file
// explicitly downloaded and selected by the director. No Backup password is exposed.
async function readPdfPages(bytes){
  const pdf=await pdfjs.getDocument({data:bytes.slice()}).promise;
  const pages=[];
  for(let i=1;i<=pdf.numPages;i++)pages.push(await pdf.getPage(i));
  return pages;
}

function PdfPage({ page, pageIndex, mode, marks, addMark, updateStroke, stamp }) {
  const base = useRef(null);
  const overlay = useRef(null);
  const currentStroke = useRef(null);
  const [dims, setDims] = useState({width:0,height:0});
  useEffect(() => {
    if (!page || !base.current) return;
    let canceled = false;
    const viewport = page.getViewport({scale:1.25});
    const canvas = base.current;
    canvas.width = Math.round(viewport.width); canvas.height=Math.round(viewport.height);
    const task = page.render({canvasContext:canvas.getContext("2d"),viewport});
    task.promise.then(()=>{if(!canceled)setDims({width:canvas.width,height:canvas.height});}).catch(()=>{});
    return ()=>{canceled=true;task.cancel();};
  },[page]);
  useEffect(() => {
    const canvas=overlay.current;
    if(!canvas||!dims.width)return;
    canvas.width=dims.width;canvas.height=dims.height;
    const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(const mark of marks){
      if(mark.type==="stroke"){
        ctx.strokeStyle="#113b89";ctx.lineWidth=2.6;ctx.lineCap="round";ctx.lineJoin="round";
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
  const down = e=>{
    if(mode==="view")return;
    e.preventDefault();
    const [x,y]=position(e);
    if(mode==="stamp"){
      if(!stamp)return;
      addMark(pageIndex,{type:"stamp",image:stamp,x:Math.max(0,Math.min(.7,x-.15)),y:Math.max(0,Math.min(.9,y-.05)),w:.3,h:.1});
    }else{
      const id=`stroke-${Date.now()}-${Math.random()}`;
      currentStroke.current=id;
      addMark(pageIndex,{type:"stroke",id,points:[[x,y]]});
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const move=e=>{
    if(!currentStroke.current||mode!=="pen")return;
    e.preventDefault();updateStroke(pageIndex,currentStroke.current,position(e));
  };
  return <div className="relative bg-white mx-auto shadow-lg border overflow-hidden" style={{width:dims.width||"auto",maxWidth:"100%"}}>
    <canvas ref={base} className="block w-full h-auto"/>
    <canvas ref={overlay} className="absolute inset-0 w-full h-full"
      style={{touchAction: mode==="view" ? "pan-y" : "none",cursor:mode==="pen"?"crosshair":mode==="stamp"?"copy":"default",pointerEvents:mode==="view"?"none":"auto"}}
      onPointerDown={down} onPointerMove={move} onPointerUp={()=>currentStroke.current=null} onPointerCancel={()=>currentStroke.current=null}/>
    <div className="absolute top-1 left-1 bg-white/80 rounded px-1 text-xs text-gray-500 pointer-events-none">หน้า {pageIndex+1}</div>
  </div>;
}

/** Draw at any position on any PDF page, or click to place an uploaded signature image. */
export function PdfSignatureEditor({ document, onCancel, onSubmit, busy }) {
  const sourceFiles=(document.files||[]).filter(f=>f.driveId && (f.type==="PDF" || f.name?.toLowerCase().endsWith(".pdf")));
  const [fileIndex,setFileIndex]=useState(0);
  const [allSigned,setAllSigned]=useState([]);
  const [sourceBytes,setSourceBytes]=useState(null);
  const [pages,setPages]=useState([]);
  const [marks,setMarks]=useState({});
  const [mode,setMode]=useState("view");
  const [stamp,setStamp]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [loadedFromDevice,setLoadedFromDevice]=useState("");
  const loadRequest=useRef(0);
  useEffect(()=>{
    let disposed=false;
    const request=++loadRequest.current;
    setLoading(true);setError("");setPages([]);setMarks({});setSourceBytes(null);setMode("view");setLoadedFromDevice("");
    (async()=>{
      if(sourceFiles.length===0)throw new Error("คำสั่งนี้ไม่มี PDF ที่ระบบสามารถเปิดให้ลงนามได้");
      const bytes=await fetchOriginalPdf(sourceFiles[fileIndex]);
      const items=await readPdfPages(bytes);
      if(!disposed&&request===loadRequest.current){setSourceBytes(bytes);setPages(items);setLoading(false);}
    })().catch(e=>{
      if(!disposed&&request===loadRequest.current){
        const message=String(e?.message||e);
        setError(/รหัสสำรองข้อมูล Drive/i.test(message)
          ?"Google Apps Script จำกัดการอ่าน PDF ไว้สำหรับ Backup จึงไม่สามารถเปิดไฟล์เพื่อเซ็นโดยตรงได้ กรุณาเปิด PDF ต้นฉบับใน Drive ดาวน์โหลด แล้วเลือกไฟล์ที่ดาวน์โหลดมาเพื่อเซ็น"
          :"เปิด PDF จาก Drive อัตโนมัติไม่สำเร็จ: "+message+" — สามารถดาวน์โหลดต้นฉบับแล้วเลือกไฟล์จากเครื่องได้");
        setLoading(false);
      }
    });
    return()=>{disposed=true;loadRequest.current++;};
  },[document.id,fileIndex]);
  const loadFromDevice=async event=>{
    const file=event.target.files?.[0];
    event.target.value="";
    if(!file)return;
    const expected=sourceFiles[fileIndex];
    if(expected?.name&&!signaturePdfNamesMatch(file.name,expected.name)){
      const accepted=window.confirm("ชื่อไฟล์ที่เลือกไม่ตรงกับเอกสารต้นฉบับ: "+expected.name+
        "\\nเลือก: "+file.name+"\\nกรุณาตรวจว่าเป็น PDF ของคำสั่งเดียวกัน ยืนยันใช้ไฟล์นี้เพื่อเซ็น?");
      if(!accepted)return;
    }
    const request=++loadRequest.current;
    setLoading(true);setError("");setPages([]);setSourceBytes(null);setMarks({});setMode("view");setLoadedFromDevice("");
    try{
      const bytes=await readLocalSignaturePdf(file);
      const pages=await readPdfPages(bytes);
      if(request===loadRequest.current){
        setSourceBytes(bytes);setPages(pages);setLoadedFromDevice(file.name);setLoading(false);
      }
    }catch(e){
      if(request===loadRequest.current){setError("เปิด PDF ที่เลือกไม่สำเร็จ: "+String(e?.message||e));setLoading(false);}
    }
  };
  const addMark=(i,m)=>setMarks(old=>({...old,[i]:[...(old[i]||[]),m]}));
  const updateStroke=(i,id,pos)=>setMarks(old=>({...old,[i]:(old[i]||[]).map(mark=>mark.id===id?{...mark,points:[...mark.points,pos]}:mark)}));
  const undo=()=>setMarks(old=>{const key=Object.keys(old).filter(i=>(old[i]||[]).length).at(-1);if(key===undefined)return old;return {...old,[key]:old[key].slice(0,-1)};});
  const onStampFile=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      const src=await toDataUrl(file);
      // PDF-lib expects PNG for imported image; normalize jpeg/other through canvas.
      const img=new Image();img.src=src;await img.decode();
      const canvas=window.document.createElement("canvas");canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      canvas.getContext("2d").drawImage(img,0,0);
      setStamp(canvas.toDataURL("image/png"));setMode("stamp");
    }catch(e){setError("ไม่สามารถอ่านรูปลายเซ็น: "+e.message);}
  };
  const saveCurrent=async()=>{
    if (!sourceBytes) return;
    if(!Object.values(marks).flat().length){setError("กรุณาเซ็นหรือแทรกลายเซ็นก่อนบันทึก");return;}
    setSaving(true);setError("");
    try{
      const pdf=await PDFDocument.load(sourceBytes);
      for(const [k,items] of Object.entries(marks)){
        const pg=pdf.getPage(Number(k));const {width,height}=pg.getSize();
        for(const m of items){
          if(m.type==="stroke"){
            const pts=m.points;
            for(let j=1;j<pts.length;j++)pg.drawLine({start:{x:pts[j-1][0]*width,y:(1-pts[j-1][1])*height},end:{x:pts[j][0]*width,y:(1-pts[j][1])*height},thickness:1.6,color:rgb(.07,.23,.54)});
            if(pts.length===1) pg.drawCircle({x:pts[0][0]*width,y:(1-pts[0][1])*height,size:.9,color:rgb(.07,.23,.54)});
          }else if(m.type==="stamp"){
            const img=await pdf.embedPng(fromB64(m.image.split(",")[1]));
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
      {loading&&<p className="text-center py-8">กำลังเปิด PDF...</p>}
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
      {pages.map((page,i)=><PdfPage key={`${fileIndex}-${i}`} page={page} pageIndex={i} mode={mode} stamp={stamp} marks={marks[i]||[]} addMark={addMark} updateStroke={updateStroke}/>)}
    </div>
  </div>;
}
