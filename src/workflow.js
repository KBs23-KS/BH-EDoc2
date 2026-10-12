/** Pure business rules shared by reports, notifications, and publication. */
export const URGENCY = {"ด่วนที่สุด":4,"ด่วนมาก":3,"ด่วน":2,"ปกติ":1};
export const FINAL_STATES = ["เผยแพร่แล้ว", "อนุมัติ/สั่งการแล้ว"];
export const PENDING_STATES = ["รอรองผู้อำนวยการ","รอผู้อำนวยการ","ส่งกลับแก้ไข"];
export function eventTime(doc, kind = "latest") {
  const h=doc?.history || [];
  const historyTime=()=>Math.max(0,...h.map(v=>Number(v.timestamp||v.time)||0));
  if(kind==="published")return Number(doc.publishedAt)||historyTime()||Number(doc.createdAt)||0;
  if(kind==="returned")return Number(doc.returnedAt)||historyTime()||Number(doc.createdAt)||0;
  if(kind==="deputy")return Number(doc.sentToDeputyAt)||Number(doc.createdAt)||0;
  if(kind==="director")return Number(doc.sentToDirectorAt)||historyTime()||Number(doc.createdAt)||0;
  return Number(doc.lastEventAt)||historyTime()||Number(doc.createdAt)||0;
}
export function pendingSince(doc) {
  if(doc.status==="รอรองผู้อำนวยการ")return eventTime(doc,"deputy");
  if(doc.status==="รอผู้อำนวยการ")return eventTime(doc,"director");
  if(doc.status==="ส่งกลับแก้ไข")return eventTime(doc,"returned");
  return 0;
}
export function pendingAgeDays(doc, now=Date.now()) {
  const since=pendingSince(doc);
  return since ? Math.max(0,Math.floor((now-since)/86400000)) : 0;
}
export function targetUsers(doc,users) {
  return (users||[]).filter(u=>["teacher","clerk"].includes(u.role)&&u.status!=="inactive")
    .filter(u=>!doc.assignedTo||doc.assignedTo==="ทุกคน"||u.adminDept===doc.assignedTo||u.subjectArea===doc.assignedTo);
}
export function recipientSnapshot(doc,users,time=Date.now()) {
  return targetUsers(doc,users).map(u=>({id:u.id,name:u.name,role:u.role,addedAt:time,addedBy:"publication",reason:"ผู้รับเมื่อเผยแพร่"}));
}
export function recipientsOf(doc,users) {
  return Array.isArray(doc.recipientsSnapshot)?doc.recipientsSnapshot:targetUsers(doc,users).map(u=>({id:u.id,name:u.name}));
}
export function isRecipient(doc,user,users) {
  return recipientsOf(doc,users).some(u=>u.id===user.id);
}
export function canReadDoc(user,doc,users=[]) {
  if(!user||!doc||doc.isDeleted)return false;
  if(["admin","director"].includes(user.role))return true;
  if(doc.createdBy===user.id)return true;
  if(user.role==="deputy")return doc.status!=="รอผู้อำนวยการ" || FINAL_STATES.includes(doc.status);
  if(doc.type==="หนังสือเข้า"&&user.role==="clerk")return true;
  return FINAL_STATES.includes(doc.status)&&isRecipient(doc,user,users);
}
export function canViewPending(user,doc) {
  if(!PENDING_STATES.includes(doc.status)||doc.isDeleted)return false;
  if(["admin","director"].includes(user.role))return true;
  if(user.role==="deputy")return doc.status==="รอรองผู้อำนวยการ";
  return doc.createdBy===user.id || (user.role==="clerk" && doc.type==="หนังสือเข้า");
}
export function docYear(d) {const n=Number(String(d.date||"").slice(0,4));return n>=2400?n:n>1900?n+543:0;}
export function matchingDocs(docs,{q="",year="",type="",status="",start="",end="",urgency=""}={}) {
  const tokens=q.toLocaleLowerCase("th-TH").trim().split(/\s+/).filter(Boolean);
  return docs.filter(d=>(!year||String(docYear(d))===String(year))&&(!type||d.type===type)&&(!status||d.status===status)&&(!urgency||d.urgency===urgency)&&(!start||d.date>=start)&&(!end||d.date<=end)&&tokens.every(t=>[d.subject,d.docNumber,d.from,d.department,d.responsibleName,d.type].join(" ").toLocaleLowerCase("th-TH").includes(t)));
}
export function sortUrgency(items) {return [...items].sort((a,b)=>(URGENCY[b.urgency]||1)-(URGENCY[a.urgency]||1)||eventTime(b)-eventTime(a));}
export function quarterlySeries(docs,year,type="") {return Array.from({length:12},(_,i)=>({month:i+1,count:docs.filter(d=>docYear(d)===Number(year)&&(!type||d.type===type)&&Number(String(d.date).slice(5,7))===i+1).length}));}
