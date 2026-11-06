import assert from "node:assert/strict";
import webpush from "web-push";
import {
  sanitizeSubscription,deviceKey
} from "../api/_webPushServer.js";
import {
  vapidBytes,enableWebPush,disableWebPush,pushClientSupport
} from "../src/webPushClient.js";
import {readFileSync} from "node:fs";

const sub={
  endpoint:"https://fcm.googleapis.com/fcm/send/FAKE_DEVICE_ONLY",
  expirationTime:null,
  keys:{p256dh:"A".repeat(87),auth:"B".repeat(22)}
};
assert.deepEqual(sanitizeSubscription(sub),{
  endpoint:sub.endpoint,keys:sub.keys
});
assert.equal(deviceKey(sub.endpoint).length,64);
assert.notEqual(deviceKey(sub.endpoint),deviceKey(sub.endpoint+"-other"));
for(const endpoint of [
  "http://fcm.googleapis.com/fcm/send/abc",
  "https://127.0.0.1/private",
  "https://attacker.example/collect",
  "https://fcm.googleapis.com.attacker.example/x",
  "https://user:pass@fcm.googleapis.com/fcm/send/abc"
]){
  assert.throws(()=>sanitizeSubscription({...sub,endpoint}),/invalid_web_push_subscription/);
}
assert.doesNotThrow(()=>sanitizeSubscription({
  ...sub,endpoint:"https://web.push.apple.com/FAKE_APPLE_DEVICE"
}));
assert.throws(()=>sanitizeSubscription({
  ...sub,keys:{p256dh:"BAD",auth:"BAD"}
}),/invalid_web_push_subscription/);

const vapid=webpush.generateVAPIDKeys();
assert.equal(vapidBytes(vapid.publicKey).length,65);
assert.throws(()=>vapidBytes("NOT-A-REAL-VAPID-KEY"),/คีย์/);
const original={
  pushManager:globalThis.PushManager,
  secure:globalThis.isSecureContext,
  matchMedia:globalThis.matchMedia
};
globalThis.PushManager=class FakePushManager{};
globalThis.isSecureContext=true;
globalThis.matchMedia=()=>({matches:true});
const requests=[];
let permissionRequested=0,unsubscribeCount=0,subscription=null;
const worker={
  pushManager:{
    async getSubscription(){return subscription;},
    async subscribe(options){
      assert.equal(options.userVisibleOnly,true);
      assert.equal(options.applicationServerKey.length,65);
      subscription={endpoint:sub.endpoint,toJSON:()=>sub,
        async unsubscribe(){unsubscribeCount++;subscription=null;return true;}};
      return subscription;
    }
  }
};
const nav={
  userAgent:"Chrome Test",platform:"Win32",serviceWorker:{
    register:async()=>worker,ready:Promise.resolve(worker)
  }
};
const notification={
  async requestPermission(){permissionRequested++;return "granted";}
};
const fetcher=async(url,opts)=>{
  requests.push({url,opts});
  if(opts.method==="GET")return {
    ok:true,async json(){return {success:true,publicKey:vapid.publicKey};}
  };
  if(opts.method==="POST"){
    assert.deepEqual(JSON.parse(opts.body).subscription,sub);
    assert.equal(opts.credentials,"same-origin");
  }
  if(opts.method==="DELETE"){
    assert.equal(JSON.parse(opts.body).endpoint,sub.endpoint);
    assert.equal(opts.credentials,"same-origin");
  }
  return {ok:true,async json(){return {success:true};}};
};
try{
  assert.equal(pushClientSupport(nav,notification).supported,true);
  const enabled=await enableWebPush({nav,fetcher,notification});
  assert.equal(enabled.enabled,true);
  assert.equal(permissionRequested,1,"Permission must be explicit opt-in");
  assert.deepEqual(requests.map(x=>x.opts.method),["GET","POST"]);
  const disabled=await disableWebPush({nav,fetcher});
  assert.equal(disabled.enabled,false);
  assert.equal(unsubscribeCount,1);
  assert.equal(requests.at(-1).opts.method,"DELETE");
  const ipad={
    ...nav,userAgent:"Mozilla iPad",platform:"iPad",standalone:false
  };
  globalThis.matchMedia=()=>({matches:false});
  assert.match(pushClientSupport(ipad,notification).reason,/หน้าจอหลัก/);
}finally{
  if(original.pushManager===undefined)delete globalThis.PushManager;
  else globalThis.PushManager=original.pushManager;
  if(original.secure===undefined)delete globalThis.isSecureContext;
  else globalThis.isSecureContext=original.secure;
  if(original.matchMedia===undefined)delete globalThis.matchMedia;
  else globalThis.matchMedia=original.matchMedia;
}
const sw=readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");
const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
const api=readFileSync(new URL("../api/push-dispatch.js",import.meta.url),"utf8");
assert.match(sw,/addEventListener\("push"/);
assert.match(sw,/registration\.showNotification/);
assert.match(sw,/addEventListener\("notificationclick"/);
assert.match(sw,/clients\.openWindow/);
assert.doesNotMatch(sw,/caches\.open\(/);
assert.match(app,/PUSH_UI_ENABLED/);
assert.match(app,/clientNotificationCandidates/);
assert.match(app,/navigator\.setAppBadge\(pendingIconBadge\)/);
assert.match(api,/verifiedPushUser\(req\)/);
assert.match(api,/serverNotificationEvent/);
assert.doesNotMatch(api,/recipientIds\s*:\s*data\./,
  "Never trust a browser-supplied list of notification recipients");
console.log("PASS: free Web Push device opt-in, VAPID key, iPad installation, privacy and server rights");
