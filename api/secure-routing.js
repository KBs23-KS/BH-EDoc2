/**
 * PREVIEW-ONLY, PRIVATE SERVER ROUTING COMMANDS FOR THE REAL BHS SCHEMA.
 * NEVER enable on bhs-edoc-2 until the entire production migration has been
 * tested and approved. Only bhs-edoc-security-test can be selected by the
 * server Admin project isolation guard in _signatureServer.
 */
import {randomUUID} from "node:crypto";
import {fail,forbidCrossSite,setupResponse,readAppSession,appSessionFingerprint}
  from "./_signatureServer.js";
import {requirePreviewSchoolSession,secureApiPreviewReady,
  secureApiResponse,enforceJsonSameOrigin} from "./_schoolSessionGuard.js";
import {canExecuteRoutingAction,ROUTING_COMMANDS}
  from "../shared/secureRoutingPolicy.js";
import {audienceSnapshot,assignmentKey,routingGroups}
  from "../src/routing.js";
import {recipientsOf} from "../src/workflow.js";

const ROOT="artifacts/bhs-edoc-app/public/data/";
const bad=(status,code)=>Object.assign(new Error(code),{status,code});
const entryId=()=>"secure-"+randomUUID();
const stamp=(name,actor,docId,now,detail)=>({
  action:name,userId:actor.id,userName:actor.name,role:actor.role,
  targetType:"DOCUMENT",targetId:docId,detail,timestamp:now
});
export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="POST")return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(!secureApiPreviewReady("BHS_ENABLE_SECURE_ROUTING_PREVIEW"))
    return secureApiResponse(res,503);
  if(!enforceJsonSameOrigin(req))return secureApiResponse(res,403);
  const body=req.body;
  if(!body||typeof body!=="object"||Array.isArray(body)||
     JSON.stringify(body).length>15000||
     !ROUTING_COMMANDS.has(body.action)||
     typeof body.docId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(body.docId)||
     !body.options||typeof body.options!=="object"||Array.isArray(body.options))
    return secureApiResponse(res,400);
  try{
    const {user,db}=await requirePreviewSchoolSession(req);
    const session=readAppSession(req);
    const response=await db.runTransaction(async tx=>{
      const accountRef=db.doc(ROOT+"bhs_users/"+user.id);
      const settingRef=db.doc(ROOT+"bhs_settings/system");
      const docRef=db.doc(ROOT+"bhs_documents/"+body.docId);
      const [freshUser,settingSnap,usersSnap,documentSnap]=await Promise.all([
        tx.get(accountRef),tx.get(settingRef),
        tx.get(db.collection(ROOT+"bhs_users")),tx.get(docRef)
      ]);
      if(!freshUser.exists||!settingSnap.exists||!documentSnap.exists)
        throw bad(404,"not_found");
      const actor={id:freshUser.id,...freshUser.data()};
      if(actor.status==="inactive"||!session||
         session.userId!==actor.id||
         appSessionFingerprint(actor)!==session.credentialTag)
        throw bad(401,"session_invalid");
      const settings=settingSnap.data();
      const users=usersSnap.docs.map(s=>({id:s.id,...s.data()}));
      const record={id:documentSnap.id,...documentSnap.data()};
      const op=body.action,options=body.options;
      if(!canExecuteRoutingAction(actor,op,record,options,users,settings))
        throw bad(403,"not_allowed");
      const now=Date.now();
      let changes={},label="",details="";
      const oldRecipients=Array.isArray(record.recipientsSnapshot)?
        record.recipientsSnapshot:
        recipientsOf(record,users).map(r=>({
          id:r.id,name:r.name,role:r.role||"teacher",
          addedBy:"legacy",reason:"ผู้รับเดิม"
        }));
      if(op==="route"){
        const {groups=[],userIds=[],all=false,message="",supersedes=""}=options;
        const event={
          id:entryId(),kind:"director",by:actor.id,byName:actor.name,
          at:now,docId:record.id,groups,userIds,all,message,
          ...(supersedes?{supersedes}:{})
        };
        changes={
          routingEntries:[...(record.routingEntries||[]),event],
          recipientsSnapshot:audienceSnapshot({
            groups,users:userIds,all
          },users,oldRecipients,actor.id,now)
        };
        label="ผอ. เกษียณหนังสือ";details=message||"เพิ่มผู้รับ";
      }else if(op==="headAction"){
        const {group,userIds=[],message="",reassign=false,broadcastAllTeachers=false}=options;
        const prior=[...(record.headActions||[])].reverse().find(x=>x.group===group);
        const participants=broadcastAllTeachers?
          users.filter(u=>u.role==="teacher"&&u.status!=="inactive").map(u=>u.id):
          userIds;
        const event={
          id:entryId(),kind:"head",by:actor.id,byName:actor.name,
          at:now,docId:record.id,group,
          userIds:broadcastAllTeachers?[]:participants,
          broadcastAllTeachers,message,
          ...(prior?{supersedes:prior.id}:{})
        };
        changes={
          headActions:[...(record.headActions||[]),event],
          recipientsSnapshot:audienceSnapshot({
            users:participants
          },users,oldRecipients,actor.id,now)
        };
        label=reassign?"หัวหน้าเปลี่ยนผู้รับมอบหมาย":
          broadcastAllTeachers?"ประชาสัมพันธ์ครูทุกคน":
          participants.length?"หัวหน้าเกษียณต่อ":"หัวหน้ารับทราบ";
        details=group+" "+message;
      }else if(op==="acknowledge"){
        changes={
          acknowledgedBy:[...(record.acknowledgedBy||[]),actor.id],
          acknowledgedAt:{
            ...(record.acknowledgedAt||{}),
            [actor.id]:now
          }
        };
        // Server creates the per-user receipt only once; a second request
        // cannot forge another recipient's acknowledgement.
        const receiptRef=docRef.collection("receipts").doc(actor.id);
        const receipt=await tx.get(receiptRef);
        if(receipt.exists)throw bad(409,"already_acknowledged");
        tx.create(receiptRef,{uid:actor.id,acknowledgedAt:now});
        label="รับทราบเอกสาร";details="รับทราบจากรายละเอียดเอกสาร";
      }else if(op==="acknowledgeAssignment"){
        const event=[...(record.routingEntries||[]),...(record.headActions||[])]
          .find(x=>x.id===options.assignmentEventId);
        if(!event)throw bad(404,"assignment_missing");
        const key=assignmentKey(event,actor.id);
        changes={assignmentAcknowledged:[
          ...(record.assignmentAcknowledged||[]),key
        ]};
        label="รับทราบงานมอบหมาย";details=event.message||"";
      }else throw bad(400,"invalid_command");
      changes.lastEventAt=now;
      changes.history=[
        ...(record.history||[]),
        {action:label,by:actor.id,byName:actor.name,
          timestamp:now,detail:details}
      ];
      // Writes occur ONLY after every transaction read/authorization check.
      tx.update(docRef,changes);
      tx.create(db.collection(ROOT+"bhs_audit_logs").doc(entryId()),
        stamp(label,actor,record.id,now,details));
      return {success:true,action:op,docId:record.id};
    });
    return res.status(200).json(response);
  }catch(error){
    if([400,401,403,404,409].includes(error?.status))
      return secureApiResponse(res,error.status===409?403:error.status);
    console.error("Secure routing preview rejected request",error?.code||"unavailable");
    return secureApiResponse(res,503);
  }
}
