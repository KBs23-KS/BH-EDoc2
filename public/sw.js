/* Offline install shell only. Never cache authenticated responses or personal documents. */
self.addEventListener("install",event=>{self.skipWaiting()});
self.addEventListener("activate",event=>{event.waitUntil(self.clients.claim())});
self.addEventListener("fetch",event=>{
  if(event.request.mode!=="navigate")return;
  event.respondWith(fetch(event.request).catch(()=>new Response(
    "<!doctype html><html lang='th'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>BHS E-Document</title><body style='font:16px sans-serif;margin:3rem'><h2>ไม่สามารถเชื่อมต่อระบบ</h2><p>กรุณาเชื่อมต่ออินเทอร์เน็ตอีกครั้งเพื่อเปิดเอกสาร</p></body></html>",
    {headers:{"Content-Type":"text/html; charset=utf-8"}}
  )));
});

/**
 * Standards-based Web Push works with Chromium, and with iPadOS 16.4+
 * HOME SCREEN web apps. Never cache documents or passwords here.
 * The server sends a generic message rather than exposing document titles
 * to the device lock screen or the web push transport.
 */
self.addEventListener("push",event=>{
  event.waitUntil((async()=>{
    let data={};
    try{data=event.data?.json()||{};}catch{/* show generic alert */}
    const rawUrl=typeof data.url==="string"?data.url:"/";
    let url="/";
    try{
      const target=new URL(rawUrl,self.location.origin);
      if(target.origin===self.location.origin&&["/","/push-preview-check.html","/push-preview-lab.html","/push-preview-room.html"].includes(target.pathname))
        url=target.pathname+target.search;
    }catch{/* fallback */}
    // Always visibly notify. Apple revokes silent Web Push subscriptions.
    await self.registration.showNotification("BHS E-Document",{
      body:typeof data.body==="string"&&data.body.length<120?
        data.body:"มีเอกสารหรืองานใหม่ กรุณาเปิดระบบสารบรรณ",
      icon:"/icon-192.png",badge:"/icon-192.png",
      tag:typeof data.tag==="string"&&data.tag.length<100?
        data.tag:"bhs-new-doc",
      data:{url},
      renotify:false
    });
    // While the application is open it will replace this temporary badge
    // with the exact outstanding-work count from its existing UI.
    if(typeof self.navigator?.setAppBadge==="function"){
      try{await self.navigator.setAppBadge(1)}catch{}
    }
  })());
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const path=event.notification.data?.url||"/";
    const target=new URL(path,self.location.origin);
    if(target.origin!==self.location.origin)return;
    const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const existing=clients.find(c=>new URL(c.url).origin===self.location.origin);
    if(existing){
      await existing.navigate(target.href).catch(()=>{});
      await existing.focus();
    }else await self.clients.openWindow(target.href);
  })());
});
