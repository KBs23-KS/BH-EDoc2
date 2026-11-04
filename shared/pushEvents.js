/**
 * Server-verified BHS notification event policy.
 * The browser may REQUEST a dispatch, but it NEVER supplies recipients,
 * message text, a role or document status. Server recomputes all of them.
 */
import {recipientsOf} from "../src/workflow.js";
import {expandAudience,headGroups,routingGroups,isFinalDoc} from "../src/routing.js";

const MAX_AGE_MS=3*60*1000;
const known=new Set(["created","director","returned","published","route","head"]);
const actions={
  director:"เสนอผู้อำนวยการ",
  returned:"ส่งกลับแก้ไข",
  published:"อนุมัติและเผยแพร่"
};
const timeOf=e=>Number(e?.timestamp||e?.at||0);
const recent=(value,now)=>Number.isFinite(Number(value))&&Number(value)>0&&
  Number(value)<=now+10000 && now-Number(value)<=MAX_AGE_MS;
const unique=values=>[...new Set(values.filter(v=>typeof v==="string"&&v.length>0))];
const active=u=>u && u.status!=="inactive";
const byId=(users,id)=>users.find(u=>u.id===id);
function latestHistory(doc,actorId,action,now){
  const matching=(doc.history||[]).filter(h=>h?.by===actorId&&h?.action===action&&recent(timeOf(h),now));
  return matching.sort((a,b)=>timeOf(b)-timeOf(a))[0]||null;
}
function headRecipients(doc,users,settings){
  return users.filter(active).filter(u=>headGroups(u,settings)
    .some(h=>routingGroups(doc).includes(h.group))).map(u=>u.id);
}
function audience({groups=[],userIds=[],all=false},users){
  const validGroups=Array.isArray(groups)?groups.filter(g=>typeof g==="string").slice(0,40):[];
  const validIds=Array.isArray(userIds)?userIds.filter(id=>typeof id==="string").slice(0,150):[];
  return expandAudience({groups:validGroups,users:validIds,all:all===true},users).map(u=>u.id);
}
function eventById(doc,kind,id){
  if(typeof id!=="string"||id.length>160)return null;
  const list=kind==="head"?doc.headActions:doc.routingEntries;
  return Array.isArray(list)?list.find(e=>e.id===id):null;
}

export function serverNotificationEvent({
  doc,actor,kind,eventId="",users=[],settings={},now=Date.now()
}){
  if(!doc?.id||!actor?.id||!active(actor)||doc.isDeleted||
     !known.has(kind))return null;
  let timestamp=0,ids=[],title="";
  const directors=users.filter(u=>active(u)&&u.role==="director").map(u=>u.id);
  const deputies=users.filter(u=>active(u)&&u.role==="deputy").map(u=>u.id);
  const admins=users.filter(u=>active(u)&&u.role==="admin").map(u=>u.id);
  if(kind==="created"){
    if(doc.status!=="รอรองผู้อำนวยการ"||doc.createdBy!==actor.id)
      return null;
    timestamp=Number(doc.createdAt)||0;
    ids=[...deputies,...admins];
    title="มีหนังสือใหม่รอพิจารณา";
  }else if(["director","returned","published"].includes(kind)){
    const h=latestHistory(doc,actor.id,actions[kind],now);
    if(!h)return null;
    timestamp=timeOf(h);
    if(kind==="director"){
      if(doc.status!=="รอผู้อำนวยการ"||
         !["deputy","admin"].includes(actor.role))return null;
      ids=[...directors,...admins];
      title="หนังสือรอผู้อำนวยการ";
    }else if(kind==="returned"){
      if(doc.status!=="ส่งกลับแก้ไข"||
         !["deputy","director","admin"].includes(actor.role))return null;
      ids=[doc.createdBy];
      title="เอกสารถูกส่งกลับแก้ไข";
    }else{
      if(!isFinalDoc(doc)||!["director","admin"].includes(actor.role))return null;
      ids=[...recipientsOf(doc,users).map(r=>r.id),
        ...headRecipients(doc,users,settings)];
      title="มีหนังสือใหม่รอรับทราบ";
    }
  }else{
    if(!isFinalDoc(doc))return null;
    const event=eventById(doc,kind,eventId);
    if(!event||event.by!==actor.id)return null;
    timestamp=timeOf(event);
    if(kind==="route"){
      if(!["director","admin"].includes(actor.role))return null;
      const published=latestHistory(doc,actor.id,actions.published,now);
      // Publishing an incoming letter also creates its FIRST routing entry
      // in the same transaction. Send one push for that event, not two.
      if(published&&Math.abs(timeOf(published)-timestamp)<15000)return null;
      ids=[...audience(event,users),...headRecipients(doc,users,settings)];
      title="มีหนังสือเกษียณถึงคุณ";
    }else{
      if(!headGroups(actor,settings).some(h=>h.group===event.group))return null;
      const broadcast=event.broadcastAllTeachers===true?
        users.filter(u=>active(u)&&u.role==="teacher").map(u=>u.id):[];
      ids=[...audience(event,users),...broadcast];
      title="คุณได้รับมอบหมายงานใหม่";
    }
  }
  if(!recent(timestamp,now))return null;
  const eligible=unique(ids).filter(id=>id!==actor.id)
    .filter(id=>active(byId(users,id))).slice(0,150);
  if(!eligible.length)return null;
  return {
    key:[doc.id,kind,kind==="route"||kind==="head"?eventId:timestamp].join(":"),
    kind,title,at:timestamp,docId:doc.id,recipientIds:eligible
  };
}

export function clientNotificationCandidates(documents,actor,now=Date.now()){
  if(!actor?.id||!Array.isArray(documents))return [];
  const events=[];
  for(const doc of documents){
    if(!doc?.id||doc.isDeleted)continue;
    if(doc.createdBy===actor.id&&doc.status==="รอรองผู้อำนวยการ"&&
       recent(doc.createdAt,now))
      events.push({docId:doc.id,kind:"created"});
    for(const [kind,action] of Object.entries(actions)){
      const h=latestHistory(doc,actor.id,action,now);
      if(h&&(kind==="returned"?doc.status==="ส่งกลับแก้ไข":
        kind==="director"?doc.status==="รอผู้อำนวยการ":isFinalDoc(doc)))
        events.push({docId:doc.id,kind});
    }
    if(isFinalDoc(doc))for(const [kind,key] of [
      ["route","routingEntries"],["head","headActions"]
    ])for(const e of doc[key]||[]){
      if(e.by!==actor.id||!recent(e.at,now))continue;
      if(kind==="route"){
        const published=latestHistory(doc,actor.id,actions.published,now);
        if(published&&Math.abs(timeOf(published)-timeOf(e))<15000)continue;
      }
      events.push({docId:doc.id,kind,eventId:e.id});
    }
  }
  return events.slice(-20);
}
