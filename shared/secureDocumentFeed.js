/**
 * BHS school-document read policy for server-side, authenticated previews.
 * This file is intentionally pure and shared with tests. Never use it as the
 * only authorization layer: the caller must validate server session, user
 * status and Firestore project BEFORE loading these records.
 */
import {isRecipient,FINAL_STATES} from "../src/workflow.js";
import {canViewRouted} from "../src/routing.js";

const MANAGERS=new Set(["admin","director"]);
const OFFICE=new Set(["admin","director","deputy","clerk"]);
export const ALLOWED_SETTINGS=new Set([
  "schoolName","schoolLogoText","academicYear","fiscalYear",
  "adminDepts","subjectAreas","adminHeads","subjectHeads"
]);

export function safeSchoolSettings(source={}){
  if(!source||typeof source!=="object"||Array.isArray(source))return {};
  return Object.fromEntries(Object.entries(source).filter(([key])=>
    ALLOWED_SETTINGS.has(key)));
}
export function canReceiveSchoolDoc(user,record,users=[],settings={}){
  if(!user||user.status==="inactive"||!record||record.isDeleted)return false;
  if(MANAGERS.has(user.role))return true;
  if(record.createdBy===user.id)return true;
  // A deputy can see the incoming queue and finalized documents, not every
  // teacher's returned drafts or requests awaiting the director.
  if(user.role==="deputy")
    return record.status==="รอรองผู้อำนวยการ"||
      FINAL_STATES.includes(record.status);
  if(user.role==="clerk"&&record.type==="หนังสือเข้า")return true;
  if(!FINAL_STATES.includes(record.status))return false;
  return isRecipient(record,user,users)||
    canViewRouted(user,record,users,settings);
}
export function filterSchoolDocuments(user,documents=[],users=[],settings={}){
  if(!Array.isArray(documents))throw new Error("invalid_server_documents");
  return documents.filter(doc=>canReceiveSchoolDoc(user,doc,users,settings))
    .map(doc=>{
      // Defense in depth: do not return surprise credential-like document
      // attributes from previous imports or malformed school records.
      const safe={...doc};
      for(const key of Object.keys(safe)){
        if(/^(password|passwordHash|passwordSalt|apiKey|secret|credential|token)$/i.test(key))
          delete safe[key];
      }
      return safe;
    });
}
export function filterSchoolReservations(user,records=[]){
  if(!user||user.status==="inactive")return [];
  return records.filter(r=>OFFICE.has(user.role)||r.createdBy===user.id);
}
export function filterSchoolReminders(user,records=[]){
  if(!user||user.status==="inactive")return [];
  return records.filter(r=>
    (user.role==="admin")||r.targetUserId===user.id||r.senderId===user.id);
}
