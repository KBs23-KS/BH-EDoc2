/**
 * REAL Chromium smoke test: a successful Vite build does not guarantee React
 * will mount. Catch the blank-screen regression before any merge/deployment.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {chromium} from "playwright";

const port="4174";
const server=spawn(process.execPath,[
  "node_modules/vite/bin/vite.js","preview","--host","127.0.0.1","--port",port,"--strictPort"
],{stdio:["ignore","pipe","pipe"]});
let output="";
server.stdout.on("data",d=>{output+=String(d).slice(0,600)});
server.stderr.on("data",d=>{output+=String(d).slice(0,600)});
let browser;
try{
  let served=false;
  for(let i=0;i<45;i++){
    try{
      const response=await fetch("http://127.0.0.1:"+port+"/");
      if(response.ok){served=true;break;}
    }catch{}
    await delay(250);
  }
  assert.ok(served,"Vite preview failed to boot: "+output.slice(0,700));
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const page=await browser.newPage();
  const errors=[],consoleErrors=[];
  page.on("pageerror",error=>errors.push(String(error)));
  page.on("console",message=>{
    if(message.type()==="error")consoleErrors.push(message.text());
  });
  await page.goto("http://127.0.0.1:"+port+"/",{waitUntil:"domcontentloaded",timeout:30000});
  await delay(9000);
  const body=await page.locator("body").innerText();
  const rootChildren=await page.locator("#root").locator(":scope > *").count();
  console.log("BROWSER STARTUP:",JSON.stringify({
    rootChildren,bodySnippet:body.slice(0,450),errors,consoleErrors:consoleErrors.slice(0,5)
  }));
  assert.deepEqual(errors,[],"Uncaught client error caused blank screen");
  assert.ok(rootChildren>0,"App did not mount");
  assert.ok(body.trim().length>0,"White screen / empty app");
  console.log("PASS: real Chromium renders login without a blank screen");
  // Exercise the real logged-in MainLayout (CI-only fixture, zero Firebase
  // writes). This route reproduces the previous blank screen after login.
  for(const [route,expected] of [["/__badge_smoke",5],["/__badge_smoke?ack=1",4]]){
    const testPage=await browser.newPage();
    const runtimeErrors=[];
    testPage.on("pageerror",err=>runtimeErrors.push(String(err)));
    await testPage.addInitScript(()=>{
      window.__badgeCalls=[];
      Object.defineProperty(navigator,"setAppBadge",{configurable:true,
        value:async value=>{window.__badgeCalls.push(value);}});
      Object.defineProperty(navigator,"clearAppBadge",{configurable:true,
        value:async()=>{window.__badgeCalls.push(0);}});
    });
    await testPage.goto("http://127.0.0.1:"+port+route,
      {waitUntil:"domcontentloaded",timeout:30000});
    await delay(2500);
    const info=await testPage.evaluate(()=>({
      body:document.body.innerText.slice(0,650),
      rootChildren:document.querySelector("#root")?.children.length||0,
      calls:window.__badgeCalls||[],
      renderError:window.__bhsSmokeRenderError||null
    }));
    console.log("AUTHENTICATED BROWSER:",JSON.stringify({route,expected,...info,errors:runtimeErrors}));
    assert.deepEqual(runtimeErrors,[],"Logged-in layout error at "+route);
    assert.ok(info.rootChildren>0&&info.body.trim(),"White screen after login: "+route);
    assert.ok(info.calls.includes(expected),"Expected real app badge "+expected+" at "+route);
    await testPage.close();
  }
  console.log("PASS: authenticated Chromium layout displays accurate badge 5 -> 4");
}finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
}
