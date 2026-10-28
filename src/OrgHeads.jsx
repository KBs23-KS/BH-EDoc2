import React from "react";
const currentId=v=>typeof v==="string"?v:v?.primary||"";
const actingId=v=>typeof v==="string"?"":v?.acting||"";
export default function OrgHeads({form,setForm,dbUsers}) {
  const active=dbUsers.filter(u=>u.status!=="inactive"&&["teacher","clerk"].includes(u.role));
  const setHead=(kind,group,key,val)=>{
    const f=kind==="admin"?"adminHeads":"subjectHeads",old=form[f]||{},prev=old[group]||{};
    const next={primary:currentId(prev),acting:actingId(prev),[key]:val};
    setForm({...form,[f]:{...old,[group]:next}});
  };
  return <div className="bhs-modern-panel p-5 space-y-4">
    <div><h3 className="text-lg font-bold text-slate-800">หัวหน้ากลุ่มงาน / หัวหน้ากลุ่มสาระ</h3>
      <p className="text-sm text-slate-500 mt-1">กำหนดผู้รับผิดชอบหลักและผู้รักษาการ เปลี่ยนหัวหน้าได้โดยไม่ลบประวัติหนังสือเดิม</p>
    </div>
    {[["admin","กลุ่มบริหารงาน",form.adminDepts||[]],["subject","กลุ่มสาระการเรียนรู้",(form.subjectAreas||[]).filter(x=>x!=="ไม่มีกลุ่มสาระการเรียนรู้")]].map(([kind,title,groups])=>
      <div key={kind} className="space-y-2"><h4 className="font-semibold text-blue-800 mt-3">{title}</h4>
      {groups.map(g=><div key={g} className="bg-slate-50 rounded-xl border p-3 grid md:grid-cols-[1fr_1.25fr_1.25fr] gap-2 md:items-center">
        <b className="text-sm text-slate-800">{g}</b>
        {[["primary","หัวหน้า"],["acting","ผู้รักษาการ (ถ้ามี)"]].map(([key,label])=><label key={key} className="text-xs text-slate-600">
          <span className="block mb-1">{label}</span>
          <select className="w-full border rounded-xl bg-white p-2 text-sm" value={key==="primary"?currentId((kind==="admin"?form.adminHeads:form.subjectHeads)?.[g]):actingId((kind==="admin"?form.adminHeads:form.subjectHeads)?.[g])}
            onChange={e=>setHead(kind,g,key,e.target.value)}>
            <option value="">-- ยังไม่กำหนด --</option>
            {active.filter(u=>kind==="admin"?u.adminDept===g:u.subjectArea===g).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>)}
      </div>)}
      </div>)}
    <p className="text-xs text-slate-500">ผู้รักษาการมีสิทธิ์ดำเนินการในกลุ่มที่ได้รับแต่งตั้ง และรายการที่กลุ่มเคยเกษียณไว้ยังคงอยู่หลังเปลี่ยนหัวหน้า</p>
  </div>;
}
