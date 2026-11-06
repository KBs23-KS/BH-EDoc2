/**
 * Opt-in cross-device mock school events for Draft PR #46.
 * Uses existing DENY-ALL sandbox collections only.
 */
import {randomBytes} from "node:crypto";
import webpush from "web-push";
import {
  configured,database,previewGuard,validDeviceRecord,validateIdAndToken,
  safeCompare,hex,issue,rateRef,today,decrypt,labCooldownSeconds,
  makeLabPushPayload,DEVICES,COUNTERS,MAX_SENDS_PER_DEVICE,MAX_SENDS_GLOBAL
} from "./push-preview-lab.js";
import {mockAdvance,mockSummary} from "../shared/pushPreviewWorkflow.js";
import {validRoomCode,validMockRole,eligibleRoomMembers,roomPublicMembers,
  MAX_ROOM_MEMBERS,ROOM_TTL_MS,MAX_ROOM_CREATES_PER_DAY}
  from "../shared/pushPreviewMultiDevice.js";

const roomId=code=>"room-"+hex("room:"+code);
const isRoomId=id=>typeof id==="string"&&/^room-[0-9a-f]{64}$/.test(id);
const roomRef=(db,id)=>db.collection(COUNTERS).doc(id);
const deviceRef=(db,id)=>db.collection(DEVICES).doc(id);
const active=(room,now)=>Boolean(room&&room.expiresAt>now);
function verifyDevice(record,data,now){
  validDeviceRecord(record,data,now);
}
function summarize(room,deviceId,now=Date.now()){
  return {inRoom:true,isController:room.ownerId===deviceId,
    workflow:mockSummary(room.workflow),members:roomPublicMembers(room),
    expiresInMinutes:Math.max(0,Math.ceil((room.expiresAt-now)/60000))};
}
async function createRoom(db,data){
  const now=Date.now(),idCode=randomBytes(18).toString("base64url");
  const id=roomId(idCode),dev=deviceRef(db,data.deviceId);
  const quota=rateRef(db,"room-create",today());
  await db.runTransaction(async tx=>{
    const [ds,qs]=await Promise.all([tx.get(dev),tx.get(quota)]);
    verifyDevice(ds.data(),data,now);
    if(isRoomId(ds.data().roomId))
      throw issue(409,"เครื่องนี้อยู่ในห้องทดสอบแล้ว กรุณาออกก่อน");
    const count=qs.data()?.count||0;
    if(count>=MAX_ROOM_CREATES_PER_DAY)
      throw issue(429,"จำนวนห้องทดสอบที่สร้างวันนี้ครบแล้ว");
    tx.set(roomRef(db,id),{ownerId:data.deviceId,members:[],
      workflow:null,createdAt:now,expiresAt:now+ROOM_TTL_MS});
    tx.set(quota,{count:count+1,updatedAt:now},{merge:true});
    tx.update(dev,{roomId:id});
  });
  return {success:true,code:idCode,
    room:{inRoom:true,isController:true,workflow:mockSummary(null),
      members:[],expiresInMinutes:Math.ceil(ROOM_TTL_MS/60000)}};
}
async function joinRoom(db,data){
  if(!validRoomCode(data.code)||!validMockRole(data.role))
    throw issue(400,"รหัสห้องหรือบทบาทจำลองไม่ถูกต้อง");
  const now=Date.now(),id=roomId(data.code);
  const dev=deviceRef(db,data.deviceId),ref=roomRef(db,id);
  let result;
  await db.runTransaction(async tx=>{
    const [ds,rs]=await Promise.all([tx.get(dev),tx.get(ref)]);
    const device=ds.data(),room=rs.data();
    verifyDevice(device,data,now);
    if(!active(room,now)||room.ownerId===data.deviceId)
      throw issue(404,"ไม่พบห้องหรือรหัสห้องหมดอายุ");
    if(isRoomId(device.roomId)&&device.roomId!==id)
      throw issue(409,"เครื่องนี้ยังอยู่ในอีกห้อง กรุณาออกก่อน");
    const others=(Array.isArray(room.members)?room.members:[])
      .filter(x=>x.id!==data.deviceId);
    if(others.length>=MAX_ROOM_MEMBERS)
      throw issue(429,"ห้องนี้รับอุปกรณ์ครบแล้ว");
    const members=[...others,{id:data.deviceId,role:data.role}];
    tx.update(ref,{members});
    tx.update(dev,{roomId:id});
    result={success:true,room:summarize({...room,members},data.deviceId,now)};
  });
  return result;
}
async function inspectRoom(db,data){
  const now=Date.now(),ds=await deviceRef(db,data.deviceId).get();
  const device=ds.data();
  verifyDevice(device,data,now);
  if(!isRoomId(device.roomId))return {success:true,room:{inRoom:false}};
  const room=(await roomRef(db,device.roomId).get()).data();
  if(!active(room,now))return {success:true,room:{inRoom:false,expired:true}};
  if(room.ownerId!==data.deviceId&&
      !(room.members||[]).some(x=>x.id===data.deviceId))
    throw issue(403,"อุปกรณ์นี้ไม่ได้เป็นสมาชิกห้อง");
  return {success:true,room:summarize(room,data.deviceId,now)};
}
async function resetOrLeave(db,data){
  const now=Date.now(),dev=deviceRef(db,data.deviceId);
  await db.runTransaction(async tx=>{
    const ds=await tx.get(dev),device=ds.data();
    verifyDevice(device,data,now);
    if(!isRoomId(device.roomId))throw issue(404,"ยังไม่ได้เข้าร่วมห้อง");
    const ref=roomRef(db,device.roomId),rs=await tx.get(ref),room=rs.data();
    if(data.action==="roomReset"){
      if(!active(room,now)||room.ownerId!==data.deviceId)
        throw issue(403,"เฉพาะเครื่องควบคุมเท่านั้นที่เริ่มใหม่ได้");
      tx.update(ref,{workflow:null});
    }else{
      if(room){
        if(room.ownerId===data.deviceId)tx.delete(ref);
        else tx.update(ref,{members:(room.members||[]).filter(x=>x.id!==data.deviceId)});
      }
      tx.update(dev,{roomId:null});
    }
  });
  return {success:true,room:data.action==="roomReset"?undefined:{inRoom:false},
    workflow:data.action==="roomReset"?mockSummary(null):undefined};
}
async function advanceRoom(db,data,key){
  if(!Number.isInteger(data.expectedIndex)||data.expectedIndex<0||
     data.expectedIndex>=7)throw issue(400,"ลำดับขั้นตอนไม่ถูกต้อง");
  const now=Date.now(),day=today(),dev=deviceRef(db,data.deviceId);
  const quota=rateRef(db,"send",day);
  let toSend=[],result;
  await db.runTransaction(async tx=>{
    const ds=await tx.get(dev),sender=ds.data();
    verifyDevice(sender,data,now);
    if(!isRoomId(sender.roomId))throw issue(404,"ยังไม่ได้เข้าร่วมห้อง");
    const ref=roomRef(db,sender.roomId),rs=await tx.get(ref),room=rs.data();
    if(!active(room,now)||room.ownerId!==data.deviceId)
      throw issue(403,"เฉพาะเครื่องควบคุมที่ยังเปิดอยู่เท่านั้น");
    if(mockSummary(room.workflow).index!==data.expectedIndex)
      throw issue(409,"ขั้นตอนเปลี่ยนไปแล้ว กรุณาอัปเดตสถานะ");
    const next=mockAdvance(room.workflow,now);
    if(!next)throw issue(409,"ดำเนินการครบทุกขั้นตอนแล้ว");
    const recipients=eligibleRoomMembers(next.event,room);
    const refs=recipients.map(m=>deviceRef(db,m.id));
    const snaps=await Promise.all(refs.map(r=>tx.get(r)));
    const qSnap=recipients.length?await tx.get(quota):null;
    const allowed=[];
    for(let i=0;i<recipients.length;i++){
      const record=snaps[i].data();
      if(!record||record.roomId!==sender.roomId||record.expiresAt<=now||
         typeof record.encrypted!=="string")continue;
      const sent=record.sendDay===day?record.sendCount||0:0;
      const wait=labCooldownSeconds(now,record.lastSentAt);
      if(wait>0)throw issue(429,"เครื่องรับกำลังรออีก "+wait+" วินาที",
        {retryAfterSeconds:wait});
      if(sent>=MAX_SENDS_PER_DEVICE)
        throw issue(429,"เครื่องรับครบโควตารายวันแล้ว");
      allowed.push({ref:refs[i],record,sent});
    }
    const globalCount=qSnap?.data()?.count||0;
    if(globalCount+allowed.length>MAX_SENDS_GLOBAL)
      throw issue(429,"โควตารวมของวันนี้ครบแล้ว");
    for(const recipient of allowed){
      tx.update(recipient.ref,{lastSentAt:now,sendDay:day,
        sendCount:recipient.sent+1});
    }
    if(allowed.length)
      tx.set(quota,{count:globalCount+allowed.length,updatedAt:now},{merge:true});
    tx.update(ref,{workflow:next.record});
    toSend=allowed.map(x=>x.record.encrypted);
    result={success:true,workflow:next.summary,
      eligibleRoles:[...new Set(recipients.map(x=>x.role))],
      recipients:allowed.length,queued:0};
  });
  if(!toSend.length)return result;
  webpush.setVapidDetails(process.env.BHS_PUSH_LAB_VAPID_CONTACT,
    process.env.BHS_PUSH_LAB_VAPID_PUBLIC_KEY,
    process.env.BHS_PUSH_LAB_VAPID_PRIVATE_KEY);
  const message="เหตุการณ์จำลอง: "+result.workflow.status;
  const deliveries=await Promise.allSettled(toSend.map(async encrypted=>
    webpush.sendNotification(decrypt(encrypted,key),
      JSON.stringify(makeLabPushPayload(message,"/push-preview-room.html")),
      {TTL:120,urgency:"normal",timeout:9000})
  ));
  const queued=deliveries.filter(x=>x.status==="fulfilled").length;
  return {...result,queued,failed:toSend.length-queued,
    retryAfterSeconds:labCooldownSeconds(Date.now(),now)};
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, private");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","DENY");
  const respond=(status,payload)=>res.status(status).json(payload);
  try{
    previewGuard();
    if(req.method!=="POST")throw issue(405,"ต้องใช้ POST");
    const host=String(req.headers["x-forwarded-host"]||req.headers.host||"").toLowerCase();
    if(!req.headers.origin||req.headers.origin!=="https://"+host||
       req.headers["sec-fetch-site"]==="cross-site")
      throw issue(403,"ต้องเรียกจากหน้า Preview เดียวกัน");
    if(!String(req.headers["content-type"]||"").toLowerCase().startsWith("application/json"))
      throw issue(415,"ต้องใช้ JSON");
    const data=req.body;
    if(!data||typeof data!=="object"||Array.isArray(data)||
       JSON.stringify(data).length>1000||
       Object.keys(data).some(k=>!["action","deviceId","token","code","role","expectedIndex"].includes(k)))
      throw issue(400,"ข้อมูลคำขอไม่ถูกต้อง");
    validateIdAndToken(data);
    const {config,key}=configured(),db=database(config);
    if(data.action==="roomCreate")return respond(200,await createRoom(db,data));
    if(data.action==="roomJoin")return respond(200,await joinRoom(db,data));
    if(data.action==="roomStatus")return respond(200,await inspectRoom(db,data));
    if(data.action==="roomAdvance")return respond(200,await advanceRoom(db,data,key));
    if(["roomReset","roomLeave"].includes(data.action))
      return respond(200,await resetOrLeave(db,data));
    throw issue(400,"คำสั่งทดสอบไม่ถูกต้อง");
  }catch(err){
    const status=[400,403,404,405,409,415,429,502,503].includes(err?.status)?err.status:503;
    return respond(status,{success:false,error:
      [400,404,409,429,502].includes(status)?err.message:
      status===403?"ไม่มีสิทธิ์ทดสอบอุปกรณ์นี้":
      status===503?"ห้องทดสอบยังไม่พร้อม":"คำขอไม่สำเร็จ",
      ...(status===429&&Number.isInteger(err?.retryAfterSeconds)?
        {retryAfterSeconds:err.retryAfterSeconds}:{})});
  }
}
