/**
 * Free standards-based Web Push client.
 * No Firebase identity changes and no browser-stored admin/VAPID private key.
 */
const JSON_HEADERS={"Content-Type":"application/json"};
export function pushClientSupport(nav=globalThis.navigator,
  notification=globalThis.Notification){
  if(!nav||!notification||!("serviceWorker" in nav)||
     !("PushManager" in globalThis)||!globalThis.isSecureContext)
    return {supported:false,reason:"เบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือนแบบ Push"};
  const isAppleMobile=/(iPhone|iPad|iPod)/.test(nav.userAgent||"")||
    (nav.platform==="MacIntel"&&nav.maxTouchPoints>1);
  const standalone=globalThis.matchMedia?.("(display-mode: standalone)")?.matches||
    nav.standalone===true;
  if(isAppleMobile&&!standalone)
    return {supported:false,reason:"บน iPad กรุณาเพิ่มเว็บลงหน้าจอหลัก แล้วเปิดผ่านไอคอนแอปก่อน"};
  return {supported:true,reason:""};
}
export function vapidBytes(key){
  if(typeof key!=="string"||!/^[A-Za-z0-9_-]{75,100}$/.test(key))
    throw new Error("คีย์แจ้งเตือนไม่ถูกต้อง");
  const normalized=key.replace(/-/g,"+").replace(/_/g,"/");
  const binary=atob(normalized+"=".repeat((4-normalized.length%4)%4));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
async function requireOK(response){
  if(!response.ok)throw new Error(response.status===401?
    "กรุณาออกแล้วเข้าสู่ระบบอีกครั้ง เพื่อยืนยันอุปกรณ์":
    "เซิร์ฟเวอร์แจ้งเตือนยังไม่พร้อมใช้งาน");
  const data=await response.json();
  if(data?.success!==true)throw new Error("ระบบไม่ยืนยันการลงทะเบียน");
  return data;
}
async function registration(nav=globalThis.navigator){
  const worker=await nav.serviceWorker.register("/sw.js");
  // register() resolves even before activation.
  return (await nav.serviceWorker.ready)||worker;
}
// Server-side ownership check: Chrome alone cannot prove a device has been
// registered for the CURRENT school username/password session.
async function ownedDeviceRequest(endpoint,action,fetcher=globalThis.fetch){
  const response=await fetcher("/api/push-device-check",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:JSON_HEADERS,body:JSON.stringify({action,endpoint})
  });
  if(response.status===429)throw new Error("ส่งทดสอบได้ไม่เกิน 1 ครั้งต่อนาที และ 6 ครั้งต่อวัน");
  return requireOK(response);
}
export async function currentPushState(nav=globalThis.navigator,
  fetcher=globalThis.fetch){
  const support=pushClientSupport(nav);
  if(!support.supported)return {...support,enabled:false,registered:false};
  if(Notification.permission!=="granted")
    return {supported:true,enabled:false,registered:false,
      permission:Notification.permission};
  const worker=await registration(nav);
  const sub=await worker.pushManager.getSubscription();
  if(!sub)return {supported:true,enabled:false,registered:false,
    permission:"granted",reason:"ยังไม่ได้ลงทะเบียนอุปกรณ์นี้"};
  try{
    const result=await ownedDeviceRequest(sub.endpoint,"status",fetcher);
    const registered=result.registered===true;
    return {supported:true,enabled:registered,registered,
      permission:"granted",reason:registered?"":"เครื่องนี้ยังไม่ได้ผูกกับบัญชีปัจจุบัน กดเปิดแจ้งเตือนอีกครั้ง"};
  }catch{
    return {supported:true,enabled:false,registered:false,
      permission:"granted",reason:"ยังไม่สามารถยืนยันอุปกรณ์กับเซิร์ฟเวอร์ได้ กดเปิดแจ้งเตือนใหม่"};
  }
}
export async function testCurrentDevicePush({
  nav=globalThis.navigator,fetcher=globalThis.fetch
}={}){
  if(Notification.permission!=="granted")
    throw new Error("กรุณาอนุญาตการแจ้งเตือนก่อน");
  const reg=await registration(nav);
  const sub=await reg.pushManager.getSubscription();
  if(!sub)throw new Error("ยังไม่ได้ลงทะเบียน Push บนอุปกรณ์นี้");
  return ownedDeviceRequest(sub.endpoint,"test",fetcher);
}
export async function enableWebPush({
  nav=globalThis.navigator,fetcher=fetch,
  notification=globalThis.Notification
}={}){
  const support=pushClientSupport(nav,notification);
  if(!support.supported)throw new Error(support.reason);
  // MUST be called by the click handler before awaiting a network request.
  const permission=await notification.requestPermission();
  if(permission!=="granted")throw new Error(
    "ยังไม่ได้อนุญาตการแจ้งเตือน กรุณาเปิดสิทธิ์ในการตั้งค่าอุปกรณ์");
  const cfg=await requireOK(await fetcher("/api/push-subscription",{
    method:"GET",credentials:"same-origin",cache:"no-store"
  }));
  const worker=await registration(nav);
  let sub=await worker.pushManager.getSubscription();
  if(!sub)sub=await worker.pushManager.subscribe({
    userVisibleOnly:true,
    applicationServerKey:vapidBytes(cfg.publicKey)
  });
  await requireOK(await fetcher("/api/push-subscription",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:JSON_HEADERS,
    body:JSON.stringify({subscription:sub.toJSON()})
  }));
  return {enabled:true};
}
export async function disableWebPush({
  nav=globalThis.navigator,fetcher=fetch
}={}){
  if(!nav?.serviceWorker)return {enabled:false};
  const worker=await registration(nav);
  const sub=await worker.pushManager.getSubscription();
  if(!sub)return {enabled:false};
  // Remove from the current account FIRST while its 7-day cookie is valid.
  try{
    await requireOK(await fetcher("/api/push-subscription",{
      method:"DELETE",credentials:"same-origin",cache:"no-store",
      headers:JSON_HEADERS,
      body:JSON.stringify({endpoint:sub.endpoint})
    }));
  }finally{
    // Even when offline, unsubscribe locally; the server will eventually
    // remove a 404/410 expired endpoint on attempted delivery.
    await sub.unsubscribe().catch(()=>{});
  }
  return {enabled:false};
}
