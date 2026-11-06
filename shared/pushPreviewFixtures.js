/**
 * Fixed, synthetic school workflow events for PR #46 Preview only.
 * This module reuses the production routing POLICY, not school records.
 * Inputs cannot include real users, document IDs, subject lines or messages.
 */
import {serverNotificationEvent} from "./pushEvents.js";

export const TEST_SCENARIOS=Object.freeze([
  {kind:"created",label:"ครูส่งหนังสือใหม่ → รอง ผอ./ธุรการ"},
  {kind:"director",label:"รอง ผอ. เสนอเรื่อง → ผอ./ธุรการ"},
  {kind:"returned",label:"ผอ. ส่งกลับแก้ไข → เจ้าของเรื่อง"},
  {kind:"published",label:"ผอ. เผยแพร่ → ครู/หัวหน้าที่เป็นผู้รับ"},
  {kind:"route",label:"เกษียณหนังสือ → ผู้ได้รับเรื่อง"},
  {kind:"head",label:"หัวหน้ามอบหมายงาน → ครูผู้รับ"}
]);
export const TEST_RECEIVERS=Object.freeze([
  {id:"ADMIN",label:"ธุรการ / Admin"},
  {id:"DIRECTOR",label:"ผู้อำนวยการ"},
  {id:"DEPUTY",label:"รองผู้อำนวยการ"},
  {id:"TEACHER_A",label:"ครูผู้สร้างเรื่อง"},
  {id:"TEACHER_B",label:"ครูผู้รับเรื่อง"},
  {id:"HEAD",label:"หัวหน้ากลุ่มงาน"},
  {id:"DISABLED",label:"ครูที่ถูกปิดบัญชี (ต้องไม่ได้รับ)"}
]);
const USERS=[
  {id:"ADMIN",role:"admin",status:"active",adminDept:"-"},
  {id:"DIRECTOR",role:"director",status:"active",adminDept:"-"},
  {id:"DEPUTY",role:"deputy",status:"active",adminDept:"-"},
  {id:"TEACHER_A",role:"teacher",status:"active",adminDept:"Science"},
  {id:"TEACHER_B",role:"teacher",status:"active",adminDept:"Math"},
  {id:"HEAD",role:"teacher",status:"active",adminDept:"Science"},
  {id:"DISABLED",role:"teacher",status:"inactive",adminDept:"Science"}
];
const SETTINGS={adminHeads:{"Science":"HEAD"},subjectHeads:{}};
const user=id=>USERS.find(u=>u.id===id);
export function demoNotificationEvent(kind,now=Date.now()){
  if(!TEST_SCENARIOS.some(item=>item.kind===kind))return null;
  const base={
    id:"MOCK_PUSH_LAB_"+kind,type:"หนังสือเข้า",createdBy:"TEACHER_A",
    createdAt:now-1000,isDeleted:false,acknowledgedBy:[],status:"",
    subject:"ข้อมูลตัวอย่าง ไม่ใช่หนังสือจริง"
  };
  let actor="TEACHER_A",eventId="",overrides={};
  switch(kind){
    case "created":
      overrides={status:"รอรองผู้อำนวยการ"};
      break;
    case "director":
      actor="DEPUTY";
      overrides={status:"รอผู้อำนวยการ",history:[{
        action:"เสนอผู้อำนวยการ",by:actor,timestamp:now-1000
      }]};
      break;
    case "returned":
      actor="DIRECTOR";
      overrides={status:"ส่งกลับแก้ไข",history:[{
        action:"ส่งกลับแก้ไข",by:actor,timestamp:now-1000
      }]};
      break;
    case "published":
      actor="DIRECTOR";
      overrides={status:"เผยแพร่แล้ว",assignedTo:"Science",
        recipientsSnapshot:[{id:"TEACHER_A"},{id:"TEACHER_B"},{id:"DISABLED"}],
        history:[{action:"อนุมัติและเผยแพร่",by:actor,timestamp:now-1000}]};
      break;
    case "route":
      actor="DIRECTOR";eventId="TEST_ROUTE_1";
      overrides={status:"อนุมัติ/สั่งการแล้ว",assignedTo:"Science",
        routingEntries:[{id:eventId,by:actor,at:now-1000,
          groups:["Science"],userIds:["TEACHER_B"],all:false}]};
      break;
    case "head":
      actor="HEAD";eventId="TEST_HEAD_1";
      overrides={status:"เผยแพร่แล้ว",assignedTo:"Science",
        headActions:[{id:eventId,by:actor,group:"Science",at:now-1000,
          userIds:["TEACHER_B"],message:"งานจำลอง"}]};
      break;
  }
  return serverNotificationEvent({
    doc:{...base,...overrides},actor:user(actor),kind,eventId,
    users:USERS,settings:SETTINGS,now
  });
}
export function demoRecipientEligible(kind,receiver,now=Date.now()){
  if(!TEST_RECEIVERS.some(item=>item.id===receiver))return null;
  const event=demoNotificationEvent(kind,now);
  if(!event)return null;
  return {event,eligible:event.recipientIds.includes(receiver)};
}
