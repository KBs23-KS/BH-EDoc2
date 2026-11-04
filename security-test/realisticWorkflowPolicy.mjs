/**
 * EMULATOR-ONLY authorization model of BHS workflows.
 * Used for synthetic security acceptance testing, NOT a deployed backend.
 * No Firebase SDK, user credentials, or external requests in this file.
 */
import {
  canHeadAct,headGroups,isRoutingEligibleDoc,isFinalDoc,
  assignmentKey
} from "../src/routing.js";
import {isRecipient} from "../src/workflow.js";
import {allowedToSign} from "../api/_signatureServer.js";

const ACTIVE_ROLES=new Set(["admin","director","deputy","clerk","teacher"]);
export const LIVE_STATES=Object.freeze({
  deputy:"รอรองผู้อำนวยการ",
  director:"รอผู้อำนวยการ",
  returned:"ส่งกลับแก้ไข",
  approved:"อนุมัติ/สั่งการแล้ว",
  published:"เผยแพร่แล้ว"
});
const active=user=>Boolean(user?.id?.startsWith("TEST_") &&
  ACTIVE_ROLES.has(user?.role) && user?.status==="active");
const activeRecipient=(id,users)=>users.some(u=>u.id===id&&active(u));
const validRecipients=(ids,users)=>Array.isArray(ids)&&ids.length>0&&
  new Set(ids).size===ids.length&&ids.every(id=>activeRecipient(id,users));
const headGroupsFor=(actor,settings,group)=>headGroups(actor,settings).filter(x=>x.group===group);

/**
 * Every true here means "a properly authenticated server MAY act after
 * independent checks", not that Firestore permits browser writes.
 *
 * All cross-document updates, Audit Log, PDF signing, version preservation,
 * register changes and broadcasts must be implemented by trusted backend.
 */
export function mayPerform(actor,action,document,context={}){
  if(!active(actor))return false;
  const {settings={},users=[],targetGroup="",recipientIds=[],driveId="",
    nextVersion,revisionFiles=[],assignmentEventId="",reassign=false,
    broadcastAllTeachers=false}=context;
  const admin=actor.role==="admin";
  switch(action){
    case "create-incoming":
      return (admin||actor.role==="clerk")&&!document?.isDeleted&&
        document?.type==="หนังสือเข้า"&&document?.createdBy===actor.id&&
        document?.status===LIVE_STATES.deputy;
    case "deputy-review":
      return actor.role==="deputy"&&!document?.isDeleted&&
        document?.status===LIVE_STATES.deputy;
    case "director-review":
      return (actor.role==="director"||admin)&&!document?.isDeleted&&
        document?.status===LIVE_STATES.director;
    case "return-correction":
      return !document?.isDeleted&&
        ((actor.role==="deputy"&&document?.status===LIVE_STATES.deputy)||
         (actor.role==="director"&&document?.status===LIVE_STATES.director))&&
        document?.createdBy!==actor.id;
    case "resubmit-revision":
      return !document?.isDeleted&&document?.status===LIVE_STATES.returned&&
        document?.createdBy===actor.id&&
        Number.isSafeInteger(nextVersion)&&nextVersion===Number(document.activeFileVersion||1)+1&&
        Array.isArray(revisionFiles)&&revisionFiles.length>=1&&
        (!["คำสั่งโรงเรียน","หนังสือเวียนแจ้งรับทราบ"].includes(document.type)||
         (revisionFiles.length===1&&
          (revisionFiles[0].type==="PDF"||String(revisionFiles[0].name||"").toLowerCase().endsWith(".pdf"))));
    case "sign-pdf":
      // Reuses authorization policy currently enforced by the live PDF API.
      return allowedToSign(actor,document,driveId)===true;
    case "director-publish":
      return !document?.isDeleted&&(admin||actor.role==="director")&&
        document?.status===LIVE_STATES.director;
    case "director-route":
      return !document?.isDeleted&&(actor.role==="director"||admin)&&
        isRoutingEligibleDoc(document)&&
        typeof targetGroup==="string"&&
        [...(settings.adminDepts||[]),...(settings.subjectAreas||[])].includes(targetGroup)&&
        validRecipients(recipientIds,users);
    case "head-forward": {
      if(!isRoutingEligibleDoc(document)||!canHeadAct(actor,settings,targetGroup))return false;
      const assigned=new Set([document.assignedTo,
        ...(document.routingEntries||[]).flatMap(e=>e.groups||[])]);
      if(!assigned.has(targetGroup))return false;
      const previous=(document.headActions||[]).some(e=>e.group===targetGroup);
      if(previous&&!reassign)return false;
      if(reassign&&!previous)return false;
      const choices=headGroupsFor(actor,settings,targetGroup);
      if(!choices.length)return false;
      const subjectOnly=choices.every(c=>c.kind==="subject");
      if(broadcastAllTeachers)
        return !recipientIds.length&&users.some(u=>active(u)&&u.role==="teacher");
      return Array.isArray(recipientIds)&&new Set(recipientIds).size===recipientIds.length&&
        (!reassign||recipientIds.length>0)&&recipientIds.every(id=>
          users.some(u=>u.id===id&&active(u)&&
            ["clerk","teacher"].includes(u.role)&&
            (!subjectOnly||u.subjectArea===targetGroup)));
    }
    case "acknowledge-document":
      return !document?.isDeleted&&isFinalDoc(document)&&
        ["clerk","teacher"].includes(actor.role)&&
        isRecipient(document,actor,users);
    case "acknowledge-assignment": {
      if(!isRoutingEligibleDoc(document))return false;
      const entry=[...(document.routingEntries||[]),...(document.headActions||[])]
        .find(e=>e.id===assignmentEventId);
      return Boolean(entry&&(entry.userIds||[]).includes(actor.id)&&
        !(document.assignmentAcknowledged||[]).includes(assignmentKey(entry,actor.id)));
    }
    case "soft-delete":
      return admin || (actor.role==="clerk"&&document?.type==="หนังสือเข้า");
    default:
      return false;
  }
}
