import {doc,runTransaction,arrayUnion,getDoc,writeBatch} from "firebase/firestore";
import {audienceSnapshot,canHeadAct,isFinalDoc,isRoutingEligibleDoc,routeMessage,assignmentKey,headGroups,broadcastTeacherIds} from "./routing";
import {recipientsOf} from "./workflow";
export function makeRoutingActions({db,getDocumentRef,getCollectionRef,paths,user,users,settings,showToast}) {
 const audit=(name,id,detail)=>({action:name,userId:user.id,userName:user.name,role:user.role,targetType:"DOCUMENT",targetId:id,detail,timestamp:Date.now()});
 const item=(id)=>getDocumentRef(paths.documents,id);
 const auditRef=()=>doc(getCollectionRef(paths.audit));
 // Preserve old recipients when upgrading legacy documents that predate recipient snapshots.
 const previousRecipients=fresh=>Array.isArray(fresh.recipientsSnapshot)?fresh.recipientsSnapshot:recipientsOf(fresh,users).map(r=>({id:r.id,name:r.name,role:r.role||"teacher",addedBy:"legacy",reason:"ผู้รับเดิมก่อนอัปเกรด"}));
 const guarded=async (fn,success)=>{try{await fn();showToast(success,"success")}catch(e){showToast(e.message,"error");throw e;}};
 async function route(d,{groups=[],userIds=[],all=false,message="",supersedes=""}){
   if(!["admin","director"].includes(user.role))throw new Error("ไม่มีสิทธิ์เกษียณเอกสาร");
   if(!all&&!groups.length&&!userIds.length)throw new Error("กรุณาเลือกกลุ่มหรือครูผู้รับ");
   return guarded(()=>runTransaction(db,async tx=>{
     const ref=item(d.id),snap=await tx.get(ref);
     if(!snap.exists()||!isRoutingEligibleDoc(snap.data()))throw new Error("เกษียณและมอบหมายต่อได้เฉพาะหนังสือเข้าที่อนุมัติแล้ว");
     const fresh=snap.data();
     const allowed=[...(settings.adminDepts||[]),...(settings.subjectAreas||[])];
     if(groups.some(g=>!allowed.includes(g)))throw new Error("กลุ่มผู้รับไม่ถูกต้อง");
     const active=users.filter(u=>u.status!=="inactive"&&["teacher","clerk"].includes(u.role));
     if(userIds.some(id=>!active.some(u=>u.id===id)))throw new Error("รายชื่อผู้รับไม่ถูกต้อง");
     const previous=supersedes?(fresh.routingEntries||[]).find(e=>e.id===supersedes):null;
     if(supersedes&&!previous)throw new Error("ไม่พบการมอบหมายที่ต้องการเปลี่ยน");
     if(supersedes&&(fresh.routingEntries||[]).some(e=>e.supersedes===supersedes))throw new Error("การมอบหมายนี้ถูกเปลี่ยนไปแล้ว");
     if(supersedes&&!userIds.length)throw new Error("กรุณาเลือกผู้รับมอบหมายใหม่");
     const event={...routeMessage("director",user,d),groups,userIds,all,message,...(supersedes?{supersedes}:{})};
     tx.update(ref,{routingEntries:[...(fresh.routingEntries||[]),event],
       recipientsSnapshot:audienceSnapshot({groups,users:userIds,all},users,previousRecipients(fresh),user.id,event.at),
       history:arrayUnion({action:"ผอ. เกษียณหนังสือ",by:user.id,byName:user.name,timestamp:event.at,detail:message||"แจ้งเพื่อทราบ"}),lastEventAt:event.at});
     tx.set(auditRef(),audit("เกษียณหนังสือ",d.id,message||"เพิ่มผู้รับ"));
   }),"เกษียณหนังสือสำเร็จ");
 }
 async function headAction(d,{group,userIds=[],message="",reassign=false,broadcastAllTeachers=false}){
   if(!canHeadAct(user,settings,group))throw new Error("ไม่ใช่หัวหน้ากลุ่มที่ได้รับแต่งตั้ง");
   const subject=headGroups(user,settings).some(g=>g.group===group&&g.kind==="subject"&&!headGroups(user,settings).some(x=>x.group===group&&x.kind==="admin"));
   const active=users.filter(u=>u.status!=="inactive"&&["teacher","clerk"].includes(u.role));
   if(typeof broadcastAllTeachers!=="boolean")throw new Error("รูปแบบการประชาสัมพันธ์ไม่ถูกต้อง");
   if(broadcastAllTeachers&&userIds.length)throw new Error("ประชาสัมพันธ์ครูทุกคนไม่ใช่การมอบหมายงานรายบุคคล");
   if(userIds.some(id=>!active.some(u=>u.id===id&&(!subject||u.subjectArea===group))))throw new Error("เลือกผู้รับนอกขอบเขต");
   const broadcastRecipients=broadcastAllTeachers?broadcastTeacherIds(users):[];
   if(broadcastAllTeachers&&!broadcastRecipients.length)throw new Error("ไม่มีบัญชีครูที่เปิดใช้งานสำหรับประชาสัมพันธ์");
   return guarded(()=>runTransaction(db,async tx=>{
     const ref=item(d.id),snap=await tx.get(ref);
     if(!snap.exists()||!isRoutingEligibleDoc(snap.data()))throw new Error("เกษียณต่อได้เฉพาะหนังสือเข้าที่อนุมัติแล้ว");
     const fresh=snap.data();
     const routed=new Set([fresh.assignedTo,...(fresh.routingEntries||[]).flatMap(e=>e.groups||[])]);
     if(!routed.has(group))throw new Error("หนังสือไม่ได้ส่งถึงกลุ่มนี้");
     const old=[...(fresh.headActions||[])].reverse().find(e=>e.group===group);
     if(old&&!reassign)throw new Error("หัวหน้ากลุ่มนี้ดำเนินการแล้ว");
     // A head who only acknowledged a book may assign teachers later from the completed tab.
     if(reassign&&!old)throw new Error("ไม่พบรายการเกษียณเดิมที่จะแก้ไข");
     if(reassign&&!userIds.length&&!broadcastAllTeachers)throw new Error("กรุณาเลือกครูผู้รับมอบหมายใหม่ หรือประชาสัมพันธ์ครูทุกคน");
     const event={...routeMessage("head",user,d),group,userIds,message,broadcastAllTeachers,...(old?{supersedes:old.id}:{})};
     const actionName=broadcastAllTeachers?"หัวหน้าประชาสัมพันธ์ครูทุกคน":reassign?"หัวหน้าเปลี่ยนผู้รับมอบหมาย":userIds.length?"หัวหน้าเกษียณต่อ":"หัวหน้ารับทราบ";
     tx.update(ref,{headActions:[...(fresh.headActions||[]),event],
       recipientsSnapshot:audienceSnapshot({users:broadcastAllTeachers?broadcastRecipients:userIds},users,previousRecipients(fresh),user.id,event.at),
       history:arrayUnion({action:actionName,by:user.id,byName:user.name,timestamp:event.at,detail:group+" "+message}),
       lastEventAt:event.at});
     tx.set(auditRef(),audit(actionName,d.id,group));
   }),broadcastAllTeachers?"ประชาสัมพันธ์ถึงครูทุกคนสำเร็จ":reassign?"เปลี่ยนผู้รับมอบหมายแล้ว":userIds.length?"ส่งงานถึงครูแล้ว":"รับทราบและจบงานของหัวหน้าแล้ว");
 }
 async function acknowledge(d){
   return guarded(async()=>{
    const snap=await getDoc(item(d.id));
    if(!snap.exists()||!isFinalDoc(snap.data())||!recipientsOf(snap.data(),users).some(x=>x.id===user.id))
      throw new Error("ไม่มีสิทธิ์รับทราบหนังสือ");
    const b=writeBatch(db);
    b.update(item(d.id),{acknowledgedBy:arrayUnion(user.id),["acknowledgedAt."+user.id]:Date.now()});
    b.set(auditRef(),audit("รับทราบเอกสาร",d.id,"รับทราบจากรายละเอียด"));await b.commit();
   },"รับทราบหนังสือแล้ว");
 }
 async function acknowledgeAssignment(d,e){
   return guarded(()=>runTransaction(db,async tx=>{
    const ref=item(d.id),snap=await tx.get(ref);if(!snap.exists())throw new Error("ไม่พบเอกสาร");
    const fresh=snap.data(),actual=[...(fresh.routingEntries||[]),...(fresh.headActions||[])].find(x=>x.id===e.id&&(x.userIds||[]).includes(user.id));
    if(!actual)throw new Error("คุณไม่ได้รับมอบหมายรายการนี้");
    const key=assignmentKey(actual,user.id),old=fresh.assignmentAcknowledged||[];
    if(old.includes(key))return;
    tx.update(ref,{assignmentAcknowledged:[...old,key],
      history:arrayUnion({action:"รับทราบงานที่ได้รับมอบหมาย",by:user.id,byName:user.name,timestamp:Date.now(),detail:actual.message||""})});
    tx.set(auditRef(),audit("รับทราบงานมอบหมาย",d.id,e.id));
   }),"รับทราบงานมอบหมายแล้ว");
 }
 return {route,headAction,acknowledge,acknowledgeAssignment};
}
