/**
 * TEST-ONLY backend command service for BHS-shaped Firestore Emulator records.
 *
 * NEVER import into Vercel /api, src/App.jsx, or any production deployment.
 * Requires FIRESTORE_EMULATOR_HOST=127.0.0.1:8099 AND demo project ID.
 * Server verifies a Firebase token, fetches the CURRENT role/status from DB,
 * applies an allowlisted transition, and atomically writes document + audit.
 *
 * Signing is a READ-ONLY permission check: no signature bytes or Drive access.
 */
import {randomUUID} from "node:crypto";
import {FieldValue,getFirestore} from "firebase-admin/firestore";
import {mayPerform,LIVE_STATES} from "../realisticWorkflowPolicy.mjs";

export const EMULATOR_PROJECT="demo-bhs-realistic-only";
export const EMULATOR_HOST="127.0.0.1:8099";
const PREFIX="artifacts/bhs-edoc-app/public/data/";
const USER_RE=/^TEST_[A-Z0-9_]{1,80}$/;
const DOC_RE=/^TEST_DOC_[A-Z0-9_]{3,80}$/;
const ACTIONS=new Set([
  "create-incoming","deputy-review","return-correction","resubmit-revision",
  "director-publish","director-route","head-forward",
  "acknowledge-document","acknowledge-assignment","check-sign-pdf"
]);
function problem(status,code){
  const e=new Error(code);e.status=status;e.code=code;return e;
}
function text(value,max=800){
  if(typeof value!=="string"||value.trim().length<1||value.trim().length>max)
    throw problem(400,"invalid_text");
  return value.trim();
}
function ensureIds(ids,users,{allowEmpty=false}={}){
  if(!Array.isArray(ids)||(!allowEmpty&&!ids.length)||ids.length>80)
    throw problem(400,"invalid_recipients");
  const known=new Map(users.map(x=>[x.id,x]));
  const result=[];
  for(const id of ids){
    const user=known.get(id);
    if(!USER_RE.test(id)||!user||user.status!=="active"||
       !["clerk","teacher"].includes(user.role)||result.includes(id))
      throw problem(400,"invalid_recipient");
    result.push(id);
  }
  return result;
}
function mockPdf(file){
  return file&&typeof file==="object"&&
    /^TEST_FAKE_DRIVE_[A-Z0-9_]{2,40}$/.test(file.driveId||"")&&
    /^TEST_FAKE_[A-Z0-9_]{2,40}\.pdf$/.test(file.name||"")&&
    file.type==="PDF"&&
    file.url==="https://invalid.example/never-request/"+file.name&&
    Number.isSafeInteger(file.size)&&file.size>=1&&file.size<=100000;
}
function pickFakeFiles(files){
  if(!Array.isArray(files)||!files.length||files.length>6||
     !files.every(mockPdf))throw problem(400,"invalid_synthetic_pdf");
  return files.map(({name,type,driveId,url,size})=>({name,type,driveId,url,size}));
}
const unique=(a,b)=>[...new Set([...(a||[]),...(b||[])])];
const usersCollection=db=>db.collection(PREFIX+"bhs_users");
const collection=(db,name)=>db.collection(PREFIX+name);
const events=(current,action,who,now,detail)=>[
  ...(current?.history||[]),
  {action,by:who.id,byName:who.name,timestamp:now,detail}
];
function audience(ids,users,who,now,previous=[]){
  const existing=new Set(previous.map(x=>x.id));
  return [...previous,...ids.filter(id=>!existing.has(id)).map(id=>{
    const u=users.find(x=>x.id===id);
    return {id,name:u?.name||"บัญชีจำลอง",role:u?.role||"teacher",
      addedBy:who.id,addedAt:now,reason:"มอบหมายในการทดสอบ"};
  })];
}
function contextFor({settings,users,payload,current}){
  return {
    settings,users,targetGroup:payload.targetGroup||"",
    recipientIds:payload.recipientIds||[],driveId:payload.driveId||"",
    nextVersion:payload.nextVersion,revisionFiles:payload.revisionFiles||[],
    assignmentEventId:payload.assignmentEventId||"",
    reassign:payload.reassign===true,
    broadcastAllTeachers:payload.broadcastAllTeachers===true
  };
}

export function createEmulatorCommandService({app,auth}){
  // Derive the DB from the verified Firebase Admin app; never accept an
  // arbitrary Firestore client whose project cannot be independently checked.
  if(process.env.FIRESTORE_EMULATOR_HOST!==EMULATOR_HOST ||
     app?.options?.projectId!==EMULATOR_PROJECT ||
     typeof auth?.verifyIdToken!=="function")
    throw problem(503,"emulator_only_service");
  const db=getFirestore(app);
  return {
    async execute({idToken,action,docId,payload={}}){
      if(typeof idToken!=="string"||!idToken||idToken.length>4096)
        throw problem(401,"missing_identity");
      if(!ACTIONS.has(action))throw problem(400,"unknown_command");
      if(!payload||typeof payload!=="object"||Array.isArray(payload))
        throw problem(400,"invalid_payload");
      const decoded=await auth.verifyIdToken(idToken,true)
        .catch(()=>{throw problem(401,"invalid_identity");});
      const uid=decoded?.uid;
      if(!USER_RE.test(uid||"")||decoded.bhsSchoolIdentity!==true)
        throw problem(403,"invalid_school_identity");
      if(action!=="create-incoming"&&!DOC_RE.test(docId||""))
        throw problem(400,"invalid_document_id");

      const result=await db.runTransaction(async tx=>{
        const actorSnap=await tx.get(usersCollection(db).doc(uid));
        if(!actorSnap.exists||actorSnap.data()?.status!=="active")
          throw problem(403,"inactive_or_unknown_account");
        const actor={id:uid,...actorSnap.data()};
        if(!["admin","director","deputy","clerk","teacher"].includes(actor.role))
          throw problem(403,"unknown_role");
        const settingsSnap=await tx.get(collection(db,"bhs_settings").doc("system"));
        if(!settingsSnap.exists)throw problem(503,"missing_test_settings");
        const settings=settingsSnap.data();
        const people=await tx.get(usersCollection(db));
        const users=people.docs.map(x=>({id:x.id,...x.data()}));
        const nextId=action==="create-incoming"?
          "TEST_DOC_"+randomUUID().replaceAll("-","").slice(0,20).toUpperCase():docId;
        const ref=collection(db,"bhs_documents").doc(nextId);
        const snap=await tx.get(ref);
        if(action==="create-incoming"&&snap.exists)throw problem(409,"duplicate_document");
        if(action!=="create-incoming"&&!snap.exists)throw problem(404,"document_missing");
        const current=snap.exists?{id:snap.id,...snap.data()}:null;
        const now=Date.now();

        // New fields, IDs and metadata are composed on the server, not accepted
        // as a client-provided Firestore update object.
        let commandData=current;
        if(action==="create-incoming"){
          const subject=text(payload.subject,240);
          commandData={
            id:nextId,docNumber:"TEST-NEW-"+nextId.slice(-6)+"/2569",
            subject,from:"หน่วยงานทดสอบ",date:"2026-11-04",
            type:"หนังสือเข้า",status:LIVE_STATES.deputy,
            urgency:"ปกติ",createdBy:uid,createdAt:now,lastEventAt:now,
            files:[],fileVersions:[],activeFileVersion:1,signedFiles:[],
            history:[],recipientsSnapshot:[],recipientIds:[],assignedUserIds:[],
            assignedTo:"",routedGroup:"",routingEntries:[],headActions:[],
            acknowledgedBy:[],acknowledgedAt:{},assignmentAcknowledged:[],
            isDeleted:false
          };
        }
        const context=contextFor({settings,users,payload,current});
        const policyAction=action==="check-sign-pdf"?"sign-pdf":action;
        if(!mayPerform(actor,policyAction,commandData,context))
          throw problem(403,"command_not_allowed");
        if(current?.isDeleted)throw problem(403,"document_deleted");
        if(action==="check-sign-pdf"){
          // Authorization check only; never modifies a PDF, Drive file or Firestore.
          return {ok:true,allowed:true,docId,action,readOnly:true};
        }

        let changes={};
        if(action==="create-incoming"){
          const {id,...data}=commandData;
          changes=data;
          tx.create(ref,data);
        }else if(action==="deputy-review"){
          changes={status:LIVE_STATES.director,
            deputyComment:text(payload.comment||"ตรวจแล้ว",800)};
        }else if(action==="return-correction"){
          changes={status:LIVE_STATES.returned,
            rejectReason:text(payload.reason,800)};
        }else if(action==="resubmit-revision"){
          const freshFiles=pickFakeFiles(payload.revisionFiles);
          if(["คำสั่งโรงเรียน","หนังสือเวียนแจ้งรับทราบ"].includes(current.type)&&freshFiles.length!==1)
            throw problem(400,"single_pdf_only");
          const version=payload.nextVersion;
          changes={
            status:LIVE_STATES.deputy,files:freshFiles,activeFileVersion:version,
            fileVersions:[
              ...(Array.isArray(current.fileVersions)&&current.fileVersions.length?
                current.fileVersions:[{version:1,files:current.files||[],timestamp:current.createdAt}]),
              {version,files:freshFiles,timestamp:now,reason:"ส่งกลับแก้ไข"}],
            signedFiles:[],rejectReason:"",deputyComment:"",directorCommand:""
          };
        }else if(action==="director-publish"){
          const recipients=ensureIds(payload.recipientIds,users);
          changes={
            status:LIVE_STATES.approved,publishedAt:now,
            recipientIds:unique(current.recipientIds,recipients),
            recipientsSnapshot:audience(recipients,users,actor,now,
              current.recipientsSnapshot||[])
          };
        }else if(action==="director-route"){
          const recipients=ensureIds(payload.recipientIds,users);
          const group=text(payload.targetGroup,120);
          const event={
            id:"TEST_ROUTE_"+randomUUID().replaceAll("-","").slice(0,12).toUpperCase(),
            kind:"director",groups:[group],userIds:recipients,
            by:uid,byName:actor.name,at:now,message:text(payload.message||"ส่งงานทดสอบ",800)
          };
          changes={
            assignedTo:group,routedGroup:group,
            routingEntries:[...(current.routingEntries||[]),event],
            recipientIds:unique(current.recipientIds,recipients),
            assignedUserIds:unique(current.assignedUserIds,recipients),
            recipientsSnapshot:audience(recipients,users,actor,now,
              current.recipientsSnapshot||[])
          };
        }else if(action==="head-forward"){
          const group=text(payload.targetGroup,120);
          const broadcast=payload.broadcastAllTeachers===true;
          const recipients=broadcast?
            users.filter(u=>u.status==="active"&&u.role==="teacher").map(u=>u.id):
            ensureIds(payload.recipientIds||[],users,{allowEmpty:true});
          const old=(current.headActions||[]).filter(e=>e.group===group).at(-1);
          const event={
            id:"TEST_HEAD_"+randomUUID().replaceAll("-","").slice(0,12).toUpperCase(),
            kind:"head",group,userIds:broadcast?[]:recipients,
            broadcastAllTeachers:broadcast,
            by:uid,byName:actor.name,at:now,
            message:text(payload.message||"มอบหมายงานทดสอบ",800),
            ...(old?{supersedes:old.id}:{})
          };
          changes={
            headActions:[...(current.headActions||[]),event],
            recipientIds:unique(current.recipientIds,recipients),
            assignedUserIds:broadcast?(current.assignedUserIds||[]):
              unique(current.assignedUserIds,recipients),
            recipientsSnapshot:audience(recipients,users,actor,now,
              current.recipientsSnapshot||[])
          };
        }else if(action==="acknowledge-document"){
          if(!(current.recipientIds||[]).includes(uid))
            throw problem(403,"not_an_authorized_recipient");
          const receiptRef=ref.collection("receipts").doc(uid);
          const receipt=await tx.get(receiptRef);
          if(receipt.exists)throw problem(409,"already_acknowledged");
          tx.create(receiptRef,{uid,acknowledgedAt:FieldValue.serverTimestamp()});
          changes={
            acknowledgedBy:unique(current.acknowledgedBy,[uid]),
            acknowledgedAt:{...(current.acknowledgedAt||{}),[uid]:now}
          };
        }else if(action==="acknowledge-assignment"){
          const superseded=new Set([
            ...(current.routingEntries||[]),...(current.headActions||[])
          ].map(e=>e.supersedes).filter(Boolean));
          if(superseded.has(payload.assignmentEventId))
            throw problem(403,"assignment_superseded");
          const key=payload.assignmentEventId+"::"+uid;
          changes={assignmentAcknowledged:unique(current.assignmentAcknowledged,[key])};
        }else throw problem(400,"unsupported_command");

        const entry={
          action:"TEST "+action,by:uid,byName:actor.name,role:actor.role,
          timestamp:now,detail:"synthetic backend only"
        };
        if(action!=="create-incoming"){
          changes.history=events(current,"TEST "+action,actor,now,"synthetic backend only");
          changes.lastEventAt=now;
          tx.update(ref,changes);
        }
        const auditId="TEST_AUDIT_"+randomUUID().replaceAll("-","").toUpperCase();
        tx.create(collection(db,"bhs_audit_logs").doc(auditId),{
          ...entry,userId:uid,userName:actor.name,targetType:"DOCUMENT",
          targetId:nextId,detail:"synthetic-only; no real signatures or data"
        });
        return {ok:true,docId:nextId,action,status:changes.status||commandData.status};
      });
      return result;
    }
  };
}
