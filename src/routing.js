/** BHS routing helpers: pure functions, no network writes. Existing document fields remain valid. */
export const isFinalDoc = d => ["อนุมัติ/สั่งการแล้ว","เผยแพร่แล้ว"].includes(d?.status);
export const activeUser = u => u && u.status !== "inactive";
export const groupMembership = (u,group) => u.adminDept===group || u.subjectArea===group;
const idOfHead = value => typeof value==="string"?value:value?.primary||"";
const actingOfHead = value => typeof value==="string"?"":value?.acting||"";

export function headGroups(user,settings) {
  if (!user || !activeUser(user)) return [];
  const found=[];
  for (const [kind,field] of [["admin","adminHeads"],["subject","subjectHeads"]]) {
    for(const [group,entry] of Object.entries(settings?.[field]||{})) {
      if ((idOfHead(entry)===user.id || actingOfHead(entry)===user.id) && (kind==="admin" || groupMembership(user,group))) {
        found.push({kind,group});
      }
    }
  }
  return found;
}
export function canHeadAct(user,settings,group) {
  return headGroups(user,settings).some(x=>x.group===group);
}
export function expandAudience({groups=[],users=[],all=false},dbUsers) {
  const active=(dbUsers||[]).filter(u=>activeUser(u)&&["teacher","clerk"].includes(u.role));
  const ids=new Set(users);
  return active.filter(u=>all||ids.has(u.id)||groups.some(g=>groupMembership(u,g)));
}
export function uniqueRecipients(items,old=[]) {
  const seen=new Set();return [...old,...items].filter(r=>{if(!r?.id||seen.has(r.id))return false;seen.add(r.id);return true;});
}
export function audienceSnapshot({groups=[],users=[],all=false},dbUsers,existing=[],actor="publication",at=Date.now()) {
  const selected=expandAudience({groups,users,all},dbUsers).map(u=>({id:u.id,name:u.name,role:u.role,addedAt:at,addedBy:actor,reason:"ผู้รับจากการเกษียณ"}));
  return uniqueRecipients(selected,existing);
}
export function routingGroups(doc) {
  const groups=new Set();
  if(doc?.assignedTo && doc.assignedTo!=="ทุกคน" && doc.assignedTo!=="หลายกลุ่ม")groups.add(doc.assignedTo);
  for(const e of doc?.routingEntries||[])for(const g of e.groups||[])groups.add(g);
  return [...groups];
}
export function headCompleted(doc,group) {
  return (doc?.headActions||[]).some(e=>e.group===group);
}
export function pendingHeadGroups(doc,user,settings) {
  return isFinalDoc(doc) ? headGroups(user,settings).filter(g=>routingGroups(doc).includes(g.group)&&!headCompleted(doc,g.group)) : [];
}
export function assignedEvents(doc,user) {
  const events=[...(doc?.routingEntries||[]),...(doc?.headActions||[])];
  const superseded=new Set(events.map(e=>e.supersedes).filter(Boolean));
  return events.filter(e=>!superseded.has(e.id)&&(e.userIds||[]).includes(user.id));
}
export function assignmentKey(entry,userId){return String(entry.id)+"::"+String(userId);}
export function pendingAssignmentEvents(doc,user) {
  const done=doc?.assignmentAcknowledged||[];
  return assignedEvents(doc,user).filter(e=>!done.includes(assignmentKey(e,user.id)));
}
export function canViewRouted(user,doc,dbUsers,settings={}) {
  if(!user||!doc||doc.isDeleted)return false;
  if(["admin","director"].includes(user.role)||doc.createdBy===user.id)return true;
  if(!isFinalDoc(doc))return false;
  if((doc.recipientsSnapshot||[]).some(r=>r.id===user.id))return true;
  // A newly appointed head can continue pending work without modifying the original recipients snapshot.
  if(headGroups(user,settings).some(h=>routingGroups(doc).includes(h.group)))return true;
  if(assignedEvents(doc,user).length>0)return true;
  return false;
}
export function routingAlerts(docs,user,settings) {
  const items=[];
  for(const d of docs||[]) {
    if(!isFinalDoc(d)||d.isDeleted)continue;
    for(const g of pendingHeadGroups(d,user,settings))items.push({id:"head:"+d.id+":"+g.group,docId:d.id,title:"หนังสือรอเกษียณต่อ",desc:d.subject,detail:g.group,time:d.publishedAt||d.createdAt||0,type:"warning",targetMenu:"routing"});
    for(const e of pendingAssignmentEvents(d,user))items.push({id:"assignment:"+d.id+":"+e.id,docId:d.id,entryId:e.id,title:e.supersedes?"มีการเปลี่ยนผู้รับมอบหมาย":e.kind==="director"?"ผอ. เกษียณหนังสือถึงคุณ":"คุณได้รับมอบหมายงานใหม่",desc:d.subject,detail:e.message||"",time:e.at||d.publishedAt||0,type:"warning",targetMenu:"document_detail"});
  }
  return items;
}
export function routingHistory(docs,user,settings) {
  const out=[];
  for(const d of docs||[]) {
    if(d.isDeleted)continue;
    for(const e of assignedEvents(d,user))out.push({id:"hist:"+d.id+":"+e.id,docId:d.id,title:e.kind==="director"?"ผอ. เกษียณหนังสือถึงคุณ":"ได้รับมอบหมายงาน",desc:d.subject,time:e.at||0,type:"info"});
    for(const g of headGroups(user,settings)){
      for(const e of (d.headActions||[]).filter(x=>x.group===g.group))
        out.push({id:"hist-head:"+d.id+":"+e.id,docId:d.id,title:"ดำเนินการเกษียณต่อแล้ว",desc:d.subject,time:e.at||0,type:"info"});
    }
  }
  return out.sort((a,b)=>b.time-a.time);
}
export function routeMessage(type, actor, doc) {
  return {id:"route-"+Date.now()+"-"+Math.random().toString(36).slice(2,8),kind:type,by:actor.id,byName:actor.name,at:Date.now(),docId:doc.id};
}
