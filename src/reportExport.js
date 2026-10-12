import JSZip from 'jszip';
import {PDFDocument} from 'pdf-lib';

const esc=(s)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const col=(i)=>{let s='';for(let n=i+1;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const headers=['ประเภท','เลขที่','วันที่','เรื่อง','จาก/ผู้ส่ง','หน่วยงาน','สถานะ','ชั้นความเร็ว','ผู้สร้าง'];
export const registryRows=(docs)=>docs.map(d=>[d.type,d.docNumber||d.orderNumber||d.outgoingNumber||'',d.date||d.orderDate||'',d.subject||'',d.from||'',d.department||d.responsibleDept||'',d.status||'',d.urgency||'ปกติ',d.responsibleName||d.createdBy||'']);
const save=(blob,name)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),20000);};
export async function exportXlsx(docs,name='BHS-register') {
  const zip=new JSZip(), all=[headers,...registryRows(docs)];
  const data=all.map((row,r)=>`<row r="${r+1}">${row.map((v,c)=>`<c r="${col(c)}${r+1}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join('')}</row>`).join('');
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="BHS Register" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml',`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="9" width="23" customWidth="1"/></cols><sheetData>${data}</sheetData><autoFilter ref="A1:I${all.length}"/></worksheet>`);
  save(await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${name}.xlsx`);
}
/** Browser canvas renders Thai into PNG pages so PDF has readable Thai without distributing a font. */
export async function exportPdf(docs,name='BHS-register') {
  if(document.fonts?.ready)await document.fonts.ready;
  const rows=[headers,...registryRows(docs)], pdf=await PDFDocument.create();
  const width=1190,height=842, margin=34, rowH=28, rowsPerPage=26;
  for(let start=0;start<rows.length;start+=rowsPerPage){
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#183153';ctx.font='bold 24px Sarabun, sans-serif';ctx.fillText('โรงเรียนบ้านแฮดศึกษา — รายงานทะเบียนเอกสาร',margin,42);
    ctx.font='15px Sarabun, sans-serif';ctx.fillText(`จำนวน ${docs.length} รายการ | หน้า ${Math.floor(start/rowsPerPage)+1}/${Math.ceil(rows.length/rowsPerPage)}`,margin,68);
    const widths=[112,90,90,240,140,130,115,92,100],xs=widths.reduce((a,w,i)=>{a.push((a[i-1]??margin)+(i?widths[i-1]:0));return a},[]);
    rows.slice(start,start+rowsPerPage).forEach((row,j)=>{
      const y=92+j*rowH;ctx.fillStyle=(start+j===0)?'#deebfa':j%2?'#f3f6fa':'#ffffff';ctx.fillRect(margin,y,width-2*margin,rowH);
      ctx.font=(start+j===0?'bold ':'')+'13px Sarabun, sans-serif';ctx.fillStyle='#1f2937';
      row.forEach((value,k)=>{let v=String(value||'');while(ctx.measureText(v).width>widths[k]-10&&v.length>3)v=v.slice(0,-2)+'…';ctx.fillText(v,xs[k]+4,y+19);});
    });
    const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));
    const img=await pdf.embedPng(bytes);const page=pdf.addPage([width,height]);page.drawImage(img,{x:0,y:0,width,height});
  }
  save(new Blob([await pdf.save()],{type:'application/pdf'}),`${name}.pdf`);
}
