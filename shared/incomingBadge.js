/**
 * Single badge definition shared by the web app and the trusted server:
 * approved incoming letters addressed to this teacher/clerk and not yet
 * acknowledged. Never include orders, reminders or assignment alerts.
 */
import {FINAL_STATES,isRecipient} from "../src/workflow.js";

// Legacy correspondence may contain malformed snapshot entries. Such a
// document must NEVER cause the entire logged-in application to go blank.
function safelyAddressedTo(doc,user) {
  if(Array.isArray(doc?.recipientsSnapshot))
    return doc.recipientsSnapshot.some(entry=>entry?.id===user.id);
  try{return isRecipient(doc,user,[user]);}
  catch{return false;}
}

export function incomingUnreadCount(documents,user) {
  if(!Array.isArray(documents)||!user?.id||user.status==="inactive"||
     !["teacher","clerk"].includes(user.role))return 0;
  return documents.reduce((count,d)=>count+(
    d?.type==="หนังสือเข้า"&&!d.isDeleted&&FINAL_STATES.includes(d.status)&&
    !(Array.isArray(d.acknowledgedBy)&&d.acknowledgedBy.includes(user.id))&&
    safelyAddressedTo(d,user)?1:0
  ),0);
}

// POST badge refresh is authorized only for this user's RECENT acknowledgement
// confirmed by re-reading the document from Firestore on the server.
export function recentIncomingAcknowledgement(doc,user,now=Date.now()){
  if(!doc||!user?.id||user.status==="inactive"||
     !["teacher","clerk"].includes(user.role)||doc.type!=="หนังสือเข้า"||
     doc.isDeleted||!FINAL_STATES.includes(doc.status)||
     !safelyAddressedTo(doc,user)||!Array.isArray(doc.acknowledgedBy)||
     !doc.acknowledgedBy.includes(user.id))return false;
  const t=Number(doc.acknowledgedAt?.[user.id]);
  return Number.isFinite(t)&&t>0&&t<=now+10000&&now-t<=180000;
}

export const validBadgeCount=n=>
  Number.isSafeInteger(n)&&n>=0&&n<=999999;
