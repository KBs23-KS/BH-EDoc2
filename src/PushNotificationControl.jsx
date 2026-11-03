/** Opt-in Firebase web push for the signed-in device. No user password is stored. */
import React,{useEffect,useState} from "react";
import {getMessaging,getToken,deleteToken,isSupported} from "firebase/messaging";

const PUBLIC_VAPID_KEY=import.meta.env.VITE_BHS_FCM_VAPID_KEY||"";
const OPT_IN_KEY="bhs-edoc-web-push-opt-in-v1";
const TOKEN_KEY="bhs-edoc-web-push-token-v1";

function getStored(key){try{return localStorage.getItem(key)||"";}catch{return "";}}
function putStored(key,value){try{if(value)localStorage.setItem(key,value);else localStorage.removeItem(key);}catch{}}
async function tokenRegistration(app){
  if(!PUBLIC_VAPID_KEY)throw new Error("ผู้ดูแลระบบยังไม่ได้ตั้งค่าบริการ Push Notification");
  if(!("serviceWorker" in navigator)||!(await isSupported()))throw new Error("เบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือน");
  const registration=await navigator.serviceWorker.register("/sw.js");
  const token=await getToken(getMessaging(app),{vapidKey:PUBLIC_VAPID_KEY,serviceWorkerRegistration:registration});
  if(!token)throw new Error("ไม่สามารถขอข้อมูลอุปกรณ์แจ้งเตือนได้");
  const response=await fetch("/api/push-subscription",{
    method:"POST",headers:{"Content-Type":"application/json"},
    credentials:"same-origin",body:JSON.stringify({token})
  });
  if(!response.ok)throw new Error("ระบบยังไม่สามารถบันทึกอุปกรณ์นี้ได้ โปรดลองอีกครั้ง");
  putStored(TOKEN_KEY,token);
  putStored(OPT_IN_KEY,"yes");
  return token;
}
export async function unregisterPushOnLogout(app){
  const token=getStored(TOKEN_KEY);
  try{
    if(token){
      await fetch("/api/push-subscription",{
        method:"DELETE",headers:{"Content-Type":"application/json"},
        credentials:"same-origin",body:JSON.stringify({token}),keepalive:true
      });
    }
    if("Notification" in window&&Notification.permission==="granted"&&await isSupported()){
      await deleteToken(getMessaging(app)).catch(()=>{});
    }
  }catch(err){console.warn("Push unregistration deferred",err?.message);}
  finally{
    putStored(TOKEN_KEY,"");
    putStored(OPT_IN_KEY,"");
    if("clearAppBadge" in navigator)Promise.resolve(navigator.clearAppBadge()).catch(()=>{});
  }
}
function installedHomeScreen(){
  return window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
}
export default function PushNotificationControl({app,currentUser,showToast}){
  const [status,setStatus]=useState("checking");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let alive=true;
    (async()=>{
      if(!("Notification" in window)||!("serviceWorker" in navigator)||!(await isSupported())){
        if(alive)setStatus("unsupported");return;
      }
      if(!PUBLIC_VAPID_KEY){if(alive)setStatus("setup");return;}
      if(Notification.permission==="denied"){if(alive)setStatus("denied");return;}
      if(getStored(OPT_IN_KEY)==="yes"&&Notification.permission==="granted"){
        try{await tokenRegistration(app);if(alive)setStatus("on");}
        catch(err){console.warn("Push auto-reconnect unavailable",err?.message);if(alive)setStatus("off");}
      }else if(alive)setStatus("off");
    })().catch(()=>{if(alive)setStatus("unsupported")});
    return()=>{alive=false};
  },[app,currentUser.id]);

  async function enable(){
    if(busy)return;
    const apple=/iPhone|iPad|iPod/i.test(navigator.userAgent)||
      (navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
    if(apple&&!installedHomeScreen()){
      showToast("บน iPhone/iPad ให้เพิ่มเว็บแอปลงหน้าจอโฮม แล้วเปิดจากไอคอนก่อน", "error");return;
    }
    setBusy(true);
    try{
      if(!("Notification" in window))throw new Error("อุปกรณ์นี้ไม่รองรับการแจ้งเตือน");
      // Must be called directly from a user gesture, especially on iPhone/iPad.
      const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
      if(permission!=="granted")throw new Error("กรุณาอนุญาตการแจ้งเตือนในการตั้งค่าอุปกรณ์");
      await tokenRegistration(app);
      setStatus("on");showToast("เปิดแจ้งเตือนบนอุปกรณ์นี้แล้ว","success");
    }catch(err){
      setStatus(Notification.permission==="denied"?"denied":"off");
      showToast(err.message||"เปิดแจ้งเตือนไม่สำเร็จ","error");
    }finally{setBusy(false);}
  }
  async function disable(){
    if(busy)return;
    setBusy(true);
    try{
      const token=getStored(TOKEN_KEY);
      if(token){
        const response=await fetch("/api/push-subscription",{
          method:"DELETE",headers:{"Content-Type":"application/json"},
          credentials:"same-origin",body:JSON.stringify({token})
        });
        if(!response.ok)throw new Error("ปิดการแจ้งเตือนยังไม่สำเร็จ โปรดลองอีกครั้ง");
      }
      if(await isSupported())await deleteToken(getMessaging(app)).catch(()=>{});
      putStored(TOKEN_KEY,"");putStored(OPT_IN_KEY,"");
      setStatus("off");showToast("ปิดแจ้งเตือนบนอุปกรณ์นี้แล้ว","success");
    }catch(err){showToast(err.message||"ปิดแจ้งเตือนไม่สำเร็จ","error");}
    finally{setBusy(false);}
  }

  const label=status==="on"?"เปิดแจ้งเตือนบนอุปกรณ์นี้แล้ว":
    status==="denied"?"อุปกรณ์ปิดกั้นการแจ้งเตือน":
    status==="setup"?"รอผู้ดูแลระบบเปิดบริการ Push":
    status==="unsupported"?"เบราว์เซอร์นี้ยังไม่รองรับ Push":
    status==="checking"?"กำลังตรวจสอบการแจ้งเตือน":"รับแจ้งเตือนแม้ไม่ได้เปิดแอป";
  return <div className="px-3 py-3 border-b border-gray-200 bg-blue-50/50">
    <p className="text-xs font-bold text-slate-800">การแจ้งเตือนบนโทรศัพท์ / iPad / คอมพิวเตอร์</p>
    <p className="text-[11px] text-slate-600 mt-1">{label}</p>
    {status==="on"?
      <button type="button" onClick={disable} disabled={busy}
        className="mt-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50">
        {busy?"กำลังดำเนินการ...":"ปิดการแจ้งเตือนบนเครื่องนี้"}
      </button>:
      <button type="button" onClick={enable} disabled={busy||["denied","setup","unsupported","checking"].includes(status)}
        className="mt-2 rounded-lg bg-[#003366] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
        {busy?"กำลังลงทะเบียน...":"เปิดการแจ้งเตือน"}
      </button>}
  </div>;
}
