/**
 * Fixed mock workflow for PR #46 Preview lab only.
 * Server owns all steps, fake actors and fake document fields.
 * No real user or school document is accessed.
 */
import {demoWorkflowNotification,TEST_RECEIVERS} from "./pushPreviewFixtures.js";
export const MOCK_STEPS=Object.freeze([
  {id:"create",kind:"created",actor:"TEACHER_A",receiver:"DEPUTY",label:"ครูส่งหนังสือใหม่ → รอง ผอ."},
  {id:"forward",kind:"director",actor:"DEPUTY",receiver:"DIRECTOR",label:"รอง ผอ. เสนอเรื่อง → ผอ."},
  {id:"return",kind:"returned",actor:"DIRECTOR",receiver:"TEACHER_A",label:"ผอ. ส่งกลับแก้ไข → ครูเจ้าของเรื่อง"},
  {id:"resubmit",kind:"created",actor:"TEACHER_A",receiver:"DEPUTY",label:"ครูส่งเรื่องที่แก้ไข → รอง ผอ."},
  {id:"forwardAgain",kind:"director",actor:"DEPUTY",receiver:"DIRECTOR",label:"รอง ผอ. เสนอฉบับแก้ไข → ผอ."},
  {id:"publish",kind:"published",actor:"DIRECTOR",receiver:"TEACHER_B",label:"ผอ. อนุมัติและเผยแพร่ → ครูผู้รับ"},
  {id:"assign",kind:"head",actor:"HEAD",receiver:"TEACHER_B",label:"หัวหน้ามอบหมายงาน → ครูผู้รับ"}
]);
export function mockSummary(record){
  const index=Number.isInteger(record?.index)?Math.max(0,Math.min(MOCK_STEPS.length,record.index)):0;
  return {index,total:MOCK_STEPS.length,status:record?.doc?.status||"ยังไม่สร้างหนังสือจำลอง",
    done:index===MOCK_STEPS.length,next:MOCK_STEPS[index]||null};
}
export function mockAdvance(record,now=Date.now()){
  const summary=mockSummary(record),index=summary.index;
  if(summary.done)return null;
  const step=MOCK_STEPS[index];
  if(index>0&&record?.doc?.id!=="MOCK_TEST_DOCUMENT")return null;
  const d=index===0?{
    id:"MOCK_TEST_DOCUMENT",type:"หนังสือเข้า",createdBy:"TEACHER_A",
    status:"",createdAt:now-100,isDeleted:false,
    subject:"ข้อมูลจำลองเท่านั้น",history:[],routingEntries:[],
    headActions:[],recipientsSnapshot:[],assignedTo:"Science",acknowledgedBy:[]
  }:{...record.doc,history:[...(record.doc.history||[])],
     headActions:[...(record.doc.headActions||[])]};
  const at=now-100;
  let eventId="";
  if(step.id==="create")d.status="รอรองผู้อำนวยการ";
  else if(step.id==="forward"||step.id==="forwardAgain"){
    if(d.status!=="รอรองผู้อำนวยการ")return null;
    d.status="รอผู้อำนวยการ";
    d.history.push({action:"เสนอผู้อำนวยการ",by:"DEPUTY",timestamp:at});
  }else if(step.id==="return"){
    if(d.status!=="รอผู้อำนวยการ")return null;
    d.status="ส่งกลับแก้ไข";
    d.history.push({action:"ส่งกลับแก้ไข",by:"DIRECTOR",timestamp:at});
  }else if(step.id==="resubmit"){
    if(d.status!=="ส่งกลับแก้ไข")return null;
    d.status="รอรองผู้อำนวยการ";
    // A corrected synthetic re-submission is treated as a new creation event.
    d.createdAt=at;
    d.history.push({action:"ส่งกลับเข้าพิจารณาฉบับแก้ไข",by:"TEACHER_A",timestamp:at});
  }else if(step.id==="publish"){
    if(d.status!=="รอผู้อำนวยการ")return null;
    d.status="เผยแพร่แล้ว";
    d.recipientsSnapshot=[{id:"TEACHER_A"},{id:"TEACHER_B"},{id:"DISABLED"}];
    d.history.push({action:"อนุมัติและเผยแพร่",by:"DIRECTOR",timestamp:at});
  }else if(step.id==="assign"){
    if(d.status!=="เผยแพร่แล้ว")return null;
    eventId="TEST_HEAD_ASSIGNMENT";
    d.headActions.push({id:eventId,by:"HEAD",group:"Science",
      userIds:["TEACHER_B"],at,message:"มอบหมายจำลอง"});
  }else return null;
  const event=demoWorkflowNotification(d,step.actor,step.kind,now,eventId);
  if(!event)return null;
  const next={index:index+1,doc:d,updatedAt:now};
  return {record:next,summary:mockSummary(next),step,event};
}
export function mockEligible(event,recipientId){
  return TEST_RECEIVERS.some(r=>r.id===recipientId)&&
    Boolean(event?.recipientIds?.includes(recipientId));
}
