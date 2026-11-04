/**
 * ISOLATED PREVIEW ONLY — school approval & correction API.
 *
 * This does NOT sign PDFs. Orders and circulars deliberately refuse director
 * approval until an independently verified server-side PDF signing pipeline
 * is available. Never permit a client-provided signedFiles field.
 */
import {randomUUID} from "node:crypto";
import {fail,forbidCrossSite,setupResponse,readAppSession,appSessionFingerprint}
  from "./_signatureServer.js";
import {requirePreviewSchoolSession,secureApiPreviewReady,
  secureApiResponse,enforceJsonSameOrigin} from "./_schoolSessionGuard.js";
import {
  authorizeDocumentReview,allowedReviewRecipients,mayApproveWithoutPdf,
  WAITING_DEPUTY,WAITING_DIRECTOR,RETURNED,COMPLETED
} from "../shared/secureApprovalPolicy.js";
import {audienceSnapshot} from "../src/routing.js";

const ROOT="artifacts/bhs-edoc-app/public/data/";
const error=(status,code)=>Object.assign(new Error(code),{status,code});
export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="POST")return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(!secureApiPreviewReady("BHS_ENABLE_SECURE_WORKFLOW_PREVIEW"))
    return secureApiResponse(res,503);
  if(!enforceJsonSameOrigin(req))return secureApiResponse(res,403);
  const body=req.body;
  if(!body||typeof body!=="object"||Array.isArray(body)||
     JSON.stringify(body).length>12000||
     !["APPROVE","RETURN"].includes(body.action)||
     typeof body.docId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(body.docId)||
     (body.comment!==undefined&&(typeof body.comment!=="string"||body.comment.length>800))||
     (body.command!==undefined&&(typeof body.command!=="string"||body.command.length>800)))
    return secureApiResponse(res,400);
  try{
    const {user,db}=await requirePreviewSchoolSession(req);
    const session=readAppSession(req);
    const result=await db.runTransaction(async tx=>{
      const userRef=db.doc(ROOT+"bhs_users/"+user.id);
      const settingsRef=db.doc(ROOT+"bhs_settings/system");
      const ref=db.doc(ROOT+"bhs_documents/"+body.docId);
      const [userSnap,settingsSnap,usersSnap,docSnap]=await Promise.all([
        tx.get(userRef),tx.get(settingsRef),
        tx.get(db.collection(ROOT+"bhs_users")),tx.get(ref)
      ]);
      if(!userSnap.exists||!settingsSnap.exists||!docSnap.exists)
        throw error(404,"not_found");
      const actor={id:userSnap.id,...userSnap.data()};
      if(!session||session.userId!==actor.id||
         appSessionFingerprint(actor)!==session.credentialTag||
         actor.status==="inactive")
        throw error(401,"session_revoked");
      const record={id:docSnap.id,...docSnap.data()};
      if(!authorizeDocumentReview(actor,record,body.action))
        throw error(403,"review_not_allowed");
      const now=Date.now();
      let changes={},label,detail;
      if(body.action==="RETURN"){
        const reason=(body.comment||body.command||"").trim();
        if(!reason||reason.length>800)throw error(400,"reason_required");
        changes={
          status:RETURNED,returnedAt:now,rejectReason:reason
        };
        label="ส่งกลับแก้ไข";detail=reason;
      }else if(record.status===WAITING_DEPUTY){
        const comment=(body.comment||"เห็นควรดำเนินการตามเสนอ").trim();
        if(!comment)throw error(400,"comment_required");
        changes={
          status:WAITING_DIRECTOR,sentToDirectorAt:now,deputyComment:comment
        };
        label="เสนอผู้อำนวยการ";detail=comment;
      }else{
        // Absolutely never accept a signed PDF URL or signedFiles list from
        // the browser. The signing integration is a separate protected step.
        if(!mayApproveWithoutPdf(record))
          throw error(403,"verified_pdf_signature_required");
        const settings=settingsSnap.data();
        const users=usersSnap.docs.map(s=>({id:s.id,...s.data()}));
        const groups=body.routeGroups||[],userIds=body.routeUserIds||[],
          all=body.routeAll===true;
        if(!allowedReviewRecipients({groups,userIds,all},users,settings))
          throw error(400,"recipients_required");
        const message=(body.command||"อนุมัติ / ดำเนินการ").trim();
        if(!message||message.length>800)throw error(400,"command_required");
        const audience=audienceSnapshot({
          groups,users:userIds,all
        },users,[],actor.id,now);
        const event={
          id:"secure-"+randomUUID(),kind:"director",by:actor.id,
          byName:actor.name,at:now,docId:record.id,groups,userIds,
          all,message
        };
        changes={
          recipientsSnapshot:audience,routingEntries:[
            ...(record.routingEntries||[]),event
          ],
          status:COMPLETED,publishedAt:now,directorCommand:message,
          assignedTo:all?"ทุกคน":groups.length===1?groups[0]:
            groups.length?"หลายกลุ่ม":userIds.length?"ระบุบุคคล":""
        };
        label="อนุมัติและเผยแพร่";detail=message;
      }
      changes.lastEventAt=now;
      changes.history=[...(record.history||[]),{
        action:label,by:actor.id,byName:actor.name,
        role:actor.role,timestamp:now,detail
      }];
      tx.update(ref,changes);
      tx.create(db.collection(ROOT+"bhs_audit_logs").doc("secure-"+randomUUID()),{
        action:label,userId:actor.id,userName:actor.name,role:actor.role,
        targetType:"DOCUMENT",targetId:record.id,
        detail,timestamp:now
      });
      return {success:true,docId:record.id,status:changes.status};
    });
    return res.status(200).json(result);
  }catch(e){
    if([400,401,403,404].includes(e?.status))
      return secureApiResponse(res,e.status);
    console.error("Secure review preview unavailable",e?.code||"service_unavailable");
    return secureApiResponse(res,503);
  }
}
