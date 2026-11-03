/** Pure policy used by both the server-side push dispatcher and its tests. */
export const FINAL_STATES=new Set(["อนุมัติ/สั่งการแล้ว","เผยแพร่แล้ว"]);
export const PUSH_EVENTS={
  created:{status:"รอรองผู้อำนวยการ",action:"ลงทะเบียนเอกสาร / สร้างเรื่อง",message:"มีเอกสารใหม่รอรองผู้อำนวยการพิจารณา"},
  resubmitted:{status:"รอรองผู้อำนวยการ",action:"แก้ไขและส่งเรื่องใหม่",message:"มีเอกสารฉบับแก้ไขรอพิจารณา"},
  forwarded:{status:"รอผู้อำนวยการ",action:"เสนอผู้อำนวยการ",message:"มีเอกสารรอลงนามหรืออนุมัติ"},
  returned:{status:"ส่งกลับแก้ไข",action:"ส่งกลับแก้ไข",message:"มีเอกสารที่ต้องแก้ไข"},
  published:{action:"อนุมัติและเผยแพร่",message:"มีหนังสือใหม่ให้รับทราบ"},
  routed:{action:"ผอ. เกษียณหนังสือ",message:"มีหนังสือเข้าใหม่ที่เกี่ยวข้องกับคุณ"},
  head_routed:{action:"หัวหน้าเกษียณต่อ",message:"มีงานใหม่ที่ได้รับมอบหมาย"}
};
export function pushRecipientIds(event,document,users){
  const active=users.filter(u=>u.status!=="inactive");
  if(event==="created"||event==="resubmitted")
    return active.filter(u=>["deputy","admin"].includes(u.role)).map(u=>u.id);
  if(event==="forwarded")
    return active.filter(u=>["director","admin"].includes(u.role)).map(u=>u.id);
  if(event==="returned")
    return active.filter(u=>u.id===document.createdBy).map(u=>u.id);
  if(event==="routed"){
    const latest=(document.routingEntries||[]).at(-1)||{},explicit=new Set(latest.userIds||[]);
    return active.filter(u=>["teacher","clerk"].includes(u.role)&&
      (latest.all||explicit.has(u.id)||(latest.groups||[]).some(g=>u.adminDept===g||u.subjectArea===g))).map(u=>u.id);
  }
  if(event==="head_routed"){
    const latest=(document.headActions||[]).at(-1)||{},selected=new Set(latest.userIds||[]);
    return active.filter(u=>selected.has(u.id)).map(u=>u.id);
  }
  const allowed=new Set((document.recipientsSnapshot||[]).map(x=>x.id));
  return active.filter(u=>allowed.has(u.id)).map(u=>u.id);
}
export function pushEventMetadata(event,doc,actorId){
  const rule=PUSH_EVENTS[event],history=Array.isArray(doc?.history)?doc.history:[];
  const last=history[history.length-1];
  const acceptedAction=event==="head_routed"?
    ["หัวหน้าเกษียณต่อ","หัวหน้าเปลี่ยนผู้รับมอบหมาย"].includes(last?.action):
    last?.action===rule?.action;
  if(!rule||!last||!acceptedAction||last.by!==actorId||doc.isDeleted)return null;
  if(["published","routed","head_routed"].includes(event)?!FINAL_STATES.has(doc.status):doc.status!==rule.status)return null;
  if(event==="created"&&doc.createdBy!==actorId)return null;
  const stamp=Number(last.timestamp||0);
  if(!Number.isSafeInteger(stamp)||stamp<=0)return null;
  return {stamp,message:rule.message};
}
