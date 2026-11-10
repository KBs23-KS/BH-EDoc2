/**
 * Authoritative count of outstanding bell notifications for one account.
 *
 * Keeps the same categories as MainLayout's bell: executive review, returned
 * documents, published incoming/orders/circulars, manual reminders, pending
 * routing/assignment alerts. No history/acknowledged events or deleted docs.
 *
 * Server MUST supply active users, system settings, and reminders from its
 * own Firestore reads; the browser cannot choose or spoof recipient IDs.
 */
import {FINAL_STATES,isRecipient} from "../src/workflow.js";
import {routingAlerts,headGroups} from "../src/routing.js";

const ACK_TYPES=new Set([
  "หนังสือเข้า","คำสั่งโรงเรียน","หนังสือเวียนแจ้งรับทราบ"
]);
const MAX_BADGE=999999;

function targetMatch(doc,user,users){
  if(Array.isArray(doc?.recipientsSnapshot))
    return isRecipient(doc,user,users);
  return !doc?.assignedTo||doc.assignedTo==="ทุกคน"||
    user.adminDept===doc.assignedTo||user.subjectArea===doc.assignedTo;
}

export function totalPendingNotifications(documents,user,users=[],settings={},reminders=[]){
  if(!user?.id||user.status==="inactive"||!Array.isArray(documents))
    return 0;
  const active=documents.filter(d=>d&&!d.isDeleted);
  const available=new Map(active.map(d=>[d.id,d]));
  let total=0;
  for(const d of active){
    // The same role-specific queues used by MainLayout's bell.
    if(user.role==="deputy"&&d.status==="รอรองผู้อำนวยการ")total++;
    if(user.role==="director"&&d.status==="รอผู้อำนวยการ")total++;
    if(user.role==="admin"&&
      ["รอรองผู้อำนวยการ","รอผู้อำนวยการ"].includes(d.status))total++;
    if(d.createdBy===user.id&&d.status==="ส่งกลับแก้ไข")total++;
    if(["teacher","clerk"].includes(user.role)&&
       ACK_TYPES.has(d.type)&&FINAL_STATES.includes(d.status)&&
       !(Array.isArray(d.acknowledgedBy)&&d.acknowledgedBy.includes(user.id))&&
       targetMatch(d,user,users))total++;
  }
  if(Array.isArray(reminders))for(const r of reminders){
    if(r?.targetUserId!==user.id)continue;
    const doc=available.get(r.docId);
    if(doc&&!(Array.isArray(doc.acknowledgedBy)&&
      doc.acknowledgedBy.includes(user.id)))total++;
  }
  // Routing helpers already implement supersession, completed heads and
  // assignment acknowledgement. Reuse rather than duplicating permissions.
  total+=routingAlerts(active,user,settings).length;
  return Math.min(total,MAX_BADGE);
}

export function recentSchoolAcknowledgement(doc,user,now=Date.now()){
  if(!doc||!user?.id||user.status==="inactive"||
     !["teacher","clerk"].includes(user.role)||
     !ACK_TYPES.has(doc.type)||doc.isDeleted||
     !FINAL_STATES.includes(doc.status)||
     !targetMatch(doc,user,[user])||
     !Array.isArray(doc.acknowledgedBy)||
     !doc.acknowledgedBy.includes(user.id))return false;
  const t=Number(doc.acknowledgedAt?.[user.id]);
  return Number.isFinite(t)&&t>0&&t<=now+10000&&now-t<=180000;
}

export function recentAssignmentAcknowledgement(doc,user,eventId,now=Date.now()){
  if(!doc||!user?.id||user.status==="inactive"||doc.isDeleted||
     !FINAL_STATES.includes(doc.status)||typeof eventId!=="string")return false;
  const events=[...(doc.routingEntries||[]),...(doc.headActions||[])];
  const event=events.find(e=>e?.id===eventId);
  const acknowledged=doc.assignmentAcknowledged||[];
  if(!event||(event.userIds||[]).includes(user.id)===false||
     !acknowledged.includes(eventId+"::"+user.id))return false;
  return (doc.history||[]).some(e=>{
    const t=Number(e?.timestamp||0);
    return e?.action==="รับทราบงานที่ได้รับมอบหมาย"&&e.by===user.id&&
      t>0&&t<=now+10000&&now-t<=180000;
  });
}

export function recentHeadAction(doc,user,eventId,settings={},now=Date.now()){
  if(!doc||!user?.id||user.status==="inactive"||doc.isDeleted||
     !FINAL_STATES.includes(doc.status)||typeof eventId!=="string")
    return false;
  const entry=(doc.headActions||[]).find(e=>e?.id===eventId);
  if(!entry||entry.by!==user.id||!entry.group||
     !headGroups(user,settings).some(g=>g.group===entry.group))return false;
  const t=Number(entry.at);
  return Number.isFinite(t)&&t>0&&t<=now+10000&&now-t<=180000;
}
