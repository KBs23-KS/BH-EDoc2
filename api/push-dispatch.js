/** Idempotent, server-checked school-work push delivery.
 * This optional endpoint runs AFTER the Firestore write succeeds.
 * Never trusts caller-supplied recipients, status, title or badge count.
 */
import {createHash} from "node:crypto";
import {getMessaging} from "firebase-admin/messaging";
import {PUSH_EVENTS,pushEventMetadata,pushRecipientIds} from "../shared/pushPolicy.js";
import {fail,forbidCrossSite,documentRef,setupResponse} from "./_signatureServer.js";
import {authenticatedProfile,serverDb,TOKEN_COLLECTION,EVENT_COLLECTION,decryptPushToken} from "./push-subscription.js";

function isDuplicate(err){return err?.code===6||err?.code==="already-exists"||err?.code==="ALREADY_EXISTS";}
function isDeadToken(code){return ["messaging/registration-token-not-registered","messaging/invalid-registration-token"].includes(code);}

export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="POST")return fail(res,405,"ไม่รองรับคำขอนี้");
  const {docId,event}=req.body||{};
  if(typeof docId!=="string"||!/^[a-zA-Z0-9_-]{4,150}$/.test(docId)||!Object.hasOwn(PUSH_EVENTS,event))
    return fail(res,400,"คำขอแจ้งเตือนไม่ถูกต้อง");
  try{
    const actor=await authenticatedProfile(req);
    if(!actor)return fail(res,401,"กรุณาเข้าสู่ระบบใหม่");
    const db=serverDb(),snap=await documentRef(docId).get();
    if(!snap.exists)return fail(res,404,"ไม่พบเอกสาร");
    const doc=snap.data(),meta=pushEventMetadata(event,doc,actor.id);
    if(!meta)return fail(res,403,"เอกสารหรือผู้ส่งไม่ตรงกับเหตุการณ์ล่าสุด");
    const allUsers=await db.collection("artifacts/bhs-edoc-app/public/data/bhs_users").get();
    const targets=new Set(pushRecipientIds(event,doc,allUsers.docs.map(x=>({id:x.id,...x.data()}))));
    // Never notify the actor about their own work, except when their own role is a required reviewer.
    if(!targets.size)return res.status(200).json({success:true,delivered:0});
    const key=createHash("sha256").update(docId+":"+event+":"+meta.stamp).digest("hex");
    const delivery=db.collection(EVENT_COLLECTION).doc(key);
    try{await delivery.create({docId,event,stamp:meta.stamp,createdAt:Date.now(),by:actor.id});}
    catch(err){if(isDuplicate(err))return res.status(200).json({success:true,duplicate:true});throw err;}

    const tokens=await db.collection(TOKEN_COLLECTION).get();
    const endpoints=tokens.docs.filter(x=>targets.has(x.data().userId))
      .flatMap(ref=>{
        try{return [{ref:ref.ref,userId:ref.data().userId,token:decryptPushToken(ref.data().encryptedToken)}];}
        catch{return [];}
      });
    let delivered=0;
    // FCM multicast accepts up to 500 device tokens per request.
    for(let i=0;i<endpoints.length;i+=500){
      const part=endpoints.slice(i,i+500);
      const messages=part.map(x=>({
        token:x.token,
        data:{kind:event,userId:String(x.userId),docId,
          title:"BHS E-Document",body:meta.message,url:"/?doc="+encodeURIComponent(docId),badge:"1"},
        webpush:{headers:{TTL:"86400",Urgency:"normal"}}
      }));
      const results=await getMessaging().sendEach(messages);
      delivered+=results.successCount;
      await Promise.all(results.responses.map((entry,j)=>
        !entry.success&&isDeadToken(entry.error?.code)?part[j].ref.delete().catch(()=>{}):Promise.resolve()
      ));
    }
    await delivery.update({delivered,devices:endpoints.length,finishedAt:Date.now()});
    return res.status(200).json({success:true,delivered});
  }catch(err){
    console.error("School push delivery error",err?.message);
    return fail(res,503,"บริการแจ้งเตือนภายนอกยังไม่พร้อม");
  }
}
