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