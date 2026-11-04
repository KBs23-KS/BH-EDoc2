/**
 * Pure server-side role/recipient checks for legacy BHS routing actions.
 * A client-supplied role, username, document status or recipient snapshot
 * is NEVER trusted. Caller supplies current DB records.
 */
import {
  canHeadAct,headGroups,isRoutingEligibleDoc,routingGroups,assignedEvents
} from "../src/routing.js";
import {recipientsOf} from "../src/workflow.js";

const ROLES=new Set(["admin","director","deputy","clerk","teacher"]);
export const ROUTING_COMMANDS=new Set([
  "route","headAction","acknowledge","acknowledgeAssignment"
]);
export function validateRoutingInput(action,options,settings,users){
  if(!ROUTING_COMMANDS.has(action)||!options||typeof options!=="object"||
      Array.isArray(options))return false;
  const {groups=[],userIds=[],group="",message="",supersedes="",reassign=false,all=false,
    broadcastAllTeachers=false,assignmentEventId=""}=options;
  if(!Array.isArray(groups)||groups.length>32||!Array.isArray(userIds)||
    userIds.length>500||new Set(userIds).size!==userIds.length||
    typeof message!=="string"||message.length>800||
    typeof group!=="string"||group.length>120||
    typeof supersedes!=="string"||supersedes.length>120||
    typeof assignmentEventId!=="string"||assignmentEventId.length>150||
    typeof reassign!=="boolean"||typeof all!=="boolean"||
    typeof broadcastAllTeachers!=="boolean"||
    groups.some(g=>typeof g!=="string"||g.length>120))return false;
  const knownGroups=new Set([
    ...(settings?.adminDepts||[]),...(settings?.subjectAreas||[])
  ]);
  if(groups.some(g=>!knownGroups.has(g))||
    (group&&!knownGroups.has(group)))return false;
  const activeUsers=new Set(users.filter(u=>u.status!=="inactive"&&
    ["clerk","teacher"].includes(u.role)).map(u=>u.id));
  return userIds.every(id=>typeof id==="string"&&activeUsers.has(id));
}
export function canExecuteRoutingAction(actor,action,doc,options,users,settings){
  if(!actor||actor.status==="inactive"||!ROLES.has(actor.role)||
     !doc||doc.isDeleted||
     !validateRoutingInput(action,options,settings,users))return false;
  const {groups=[],userIds=[],all=false,group="",supersedes="",reassign=false,
    assignmentEventId="",broadcastAllTeachers=false}=options;
  if(action==="route"){
    if(!["admin","director"].includes(actor.role)||
       !isRoutingEligibleDoc(doc))return false;
    if(!all&&!groups.length&&!userIds.length)return false;
    if(supersedes){
      const previous=(doc.routingEntries||[]).find(e=>e.id===supersedes);
      if(!previous||(doc.routingEntries||[]).some(e=>e.supersedes===supersedes)||
         !userIds.length)return false;
    }
    return true;
  }
  if(action==="headAction"){
    if(!isRoutingEligibleDoc(doc)||!canHeadAct(actor,settings,group)||
       !routingGroups(doc).includes(group))return false;
    const prior=[...(doc.headActions||[])].reverse().find(e=>e.group===group);
    if(Boolean(prior)!==reassign)return false;
    if(reassign&&!userIds.length)return false;
    const subjectOnly=headGroups(actor,settings).some(x=>x.group===group&&x.kind==="subject")&&
      !headGroups(actor,settings).some(x=>x.group===group&&x.kind==="admin");
    if(subjectOnly&&userIds.some(id=>users.find(u=>u.id===id)?.subjectArea!==group))
      return false;
    if(broadcastAllTeachers&&(userIds.length>0||reassign))return false;
    return true;
  }
  if(action==="acknowledge"){
    return ["clerk","teacher"].includes(actor.role)&&
      ["เผยแพร่แล้ว","อนุมัติ/สั่งการแล้ว"].includes(doc.status)&&
      recipientsOf(doc,users).some(x=>x.id===actor.id)&&
      !(doc.acknowledgedBy||[]).includes(actor.id);
  }
  if(action==="acknowledgeAssignment"){
    if(!isRoutingEligibleDoc(doc))return false;
    const event=assignedEvents(doc,actor).find(e=>e.id===assignmentEventId);
    return Boolean(event&&
      !(doc.assignmentAcknowledged||[]).includes(event.id+"::"+actor.id));
  }
  return false;
}
