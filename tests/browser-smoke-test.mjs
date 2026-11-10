/**
 * REAL Chromium smoke test: a successful Vite build does not guarantee React
 * will mount. Catch the blank-screen regression before any merge/deployment.
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {chromium} from "playwright";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {TraceMap,originalPositionFor} from "@jridgewell/trace-mapping";

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
  for(const [route,expected] of [["/__badge_smoke",5],["/__badge_smoke?ack=1",4],["/__badge_smoke?mixed=1",7],["/__badge_smoke?mixed=1&ack=1",6]]){
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
    if(info.renderError?.stack){
      const match=info.renderError.stack.match(/assets\/([^:\s)]+\.js):(\d+):(\d+)/);
      if(match){
        const sourceMap=JSON.parse(readFileSync(join("dist","assets",match[1]+".map"),"utf8"));
        const orig=originalPositionFor(new TraceMap(sourceMap),{
          line:Number(match[2]),column:Number(match[3])-1
        });
        let context="";
        if(orig.source){
          const sourceFile=orig.source.replace(/^\.\.\//,"");
          try{const lines=readFileSync(sourceFile,"utf8").split("\n");
            context=lines.slice(Math.max(0,orig.line-4),orig.line+3).join("\n");
          }catch{}
        }
        console.log("MAPPED RENDER ERROR:",JSON.stringify({source:orig.source,
          line:orig.line,column:orig.column,name:orig.name,context}));
      }
    }
    assert.deepEqual(runtimeErrors,[],"Logged-in layout error at "+route);
    assert.ok(info.rootChildren>0&&info.body.trim(),"White screen after login: "+route);
    assert.ok(info.calls.includes(expected),"Expected real app badge "+expected+" at "+route);
    // The old duplicate header pill must be gone. The single bell should
    // match the exact number requested for the installed-app icon.
    assert.equal(await testPage.getByTestId("incoming-unread-count").count(),0);
    assert.equal(await testPage.getByTestId("executive-pending-count").count(),0);
    assert.ok(await testPage.getByRole("button",{
      name:new RegExp("การแจ้งเตือนค้าง "+expected+" รายการ")
    }).isVisible(),"Only bell badge should remain visible");

    await testPage.close();
  }
  console.log("PASS: authenticated Chromium bell + icon display 5→4 and mixed incoming/order/circular 7→6");
  // Different roles must have a useful app-visible number, not a permanently
  // absent incoming badge; exercise real MainLayout in actual Chromium.
  for(const role of ["deputy","director","admin"]){
    const executive=await browser.newPage();
    const errors=[];
    executive.on("pageerror",err=>errors.push(String(err)));
    await executive.goto("http://127.0.0.1:"+port+
      "/__badge_smoke?role="+role,{waitUntil:"domcontentloaded",timeout:30000});
    await delay(1800);
    const value=await executive.evaluate(()=>
      document.title.startsWith("(1) ")?"1":"0");
    const label=await executive.getByRole("button",{
      name:/การแจ้งเตือนค้าง 1 รายการ/
    }).isVisible();
    assert.equal(await executive.getByTestId("executive-pending-count").count(),0,
      "No duplicate executive header pill");
    const renderError=await executive.evaluate(()=>
      window.__bhsSmokeRenderError||null);
    console.log("EXECUTIVE BROWSER:",JSON.stringify({role,value,label,renderError,errors}));
    assert.deepEqual(errors,[],"Executive dashboard JS error");
    assert.equal(renderError,null,"Executive dashboard failed to mount");
    assert.equal(value,"1","Wrong role-aware pending review count for "+role);
    assert.ok(label,"Executive pending-work count must appear on the bell");
    await executive.close();
  }
  console.log("PASS: executive/deputy/admin counts appear on single bell, no redundant header pill, no white screen");
}finally{
  if(browser)await browser.close();
  server.kill("SIGTERM");
}
