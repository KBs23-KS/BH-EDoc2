/* BHS PWA service worker: offline navigation + privacy-preserving background notifications.
 * Never cache authenticated API responses or personal document files.
 */
self.addEventListener("install",event=>{self.skipWaiting()});
self.addEventListener("activate",event=>{event.waitUntil(self.clients.claim())});
self.addEventListener("fetch",event=>{
  if(event.request.mode!=="navigate")return;
  event.respondWith(fetch(event.request).catch(()=>new Response(
    "<!doctype html><html lang='th'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>BHS E-Document</title><body style='font:16px sans-serif;margin:3rem'><h2>ไม่สามารถเชื่อมต่อระบบ</h2><p>กรุณาเชื่อมต่ออินเทอร์เน็ตอีกครั้งเพื่อเปิดเอกสาร</p></body></html>",
    {headers:{"Content-Type":"text/html; charset=utf-8"}}
  )));
});

try{
  // Firebase messaging compat works in classic service workers without bundling.
  importScripts("https://www.gstatic.com/firebasejs/12.1.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/12.1.0/firebase-messaging-compat.js");
  firebase.initializeApp({
    apiKey:"AIzaSyDK3KOtUeQKbJAWCMWEYDfWftSHFJkejuA",
    authDomain:"bhs-edoc-2.firebaseapp.com",projectId:"bhs-edoc-2",
    messagingSenderId:"741314713509",appId:"1:741314713509:web:42203869d175cd4fb6ba4c"
  });
  const messaging=firebase.messaging();
  messaging.onBackgroundMessage(payload=>{
    const data=payload?.data||{};
    if(!data.userId||!data.docId)return;
    return (async()=>{
      // A signed-out device must never show notices intended for a former account.
      const response=await fetch("/api/app-session",{credentials:"same-origin",cache:"no-store"});
      if(!response.ok)return;
      const session=await response.json();
      if(session.userId!==data.userId)return;
      const safeUrl=typeof data.url==="string"&&data.url.startsWith("/?doc=")?data.url:"/";
      await self.registration.showNotification("BHS E-Document",{
        body:"มีงานสารบรรณที่ต้องตรวจสอบ",
        icon:"/icon-192.png",badge:"/icon-192.png",
        tag:"bhs-edoc-"+data.kind+"-"+data.docId,
        data:{url:safeUrl},
        renotify:false
      });
      if(typeof self.registration.setAppBadge==="function"){
        await self.registration.setAppBadge(1).catch(()=>{});
      }
    })().catch(()=>{});
  });
}catch(err){
  // Offline navigation continues to work if the messaging CDN is blocked.
  console.warn("BHS background messaging unavailable:",err?.message);
}

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=event.notification.data?.url||"/";
  event.waitUntil((async()=>{
    const target=new URL(url,self.location.origin).href;
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const existing=windows.find(c=>new URL(c.url).origin===self.location.origin);
    if(existing){
      if(typeof existing.navigate==="function")await existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  })());
});
