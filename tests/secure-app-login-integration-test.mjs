/**
 * Pure mocked HTTP tests for the real BHS App's preview-only secure login
 * adapter. Never uses a Firebase project, credentials, password files or API.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  secureLoginPreviewEnabled,verifySchoolSession,createSchoolSession,
  establishPrivateSchoolIdentity
} from "../src/secureSessionPreview.js";

assert.equal(secureLoginPreviewEnabled(),false);
const own={id:"TEST_TEACHER_001",name:"ครูจำลอง",role:"teacher",
  adminDept:"กลุ่มบริหารวิชาการ",subjectArea:"วิทยาศาสตร์และเทคโนโลยี",status:"active"};
const director={...own,id:"TEST_DIRECTOR_001",name:"ผอ.จำลอง",role:"director"};
const mockToken="FAKE_ONLY_CUSTOM_TOKEN_NO_REAL_AUTH_NEVER_DEPLOY";
function mockFetch({userId=own.id,users=[own,director],
  postOk=true,identityUid=userId,anonymous=false,omitToken=false}={}){
  const calls=[];
  async function fetcher(url,options={}){
    calls.push({url,method:options.method||"GET",credentials:options.credentials,
      body:options.body||""});
    const response=(data,status=200)=>({ok:status>=200&&status<300,
      status,async json(){return data;}});
    if(url==="/api/app-session"){
      if(options.method==="POST"){
        if(!postOk)return response({success:false},401);
        const data=JSON.parse(options.body||"{}");
        assert.equal(data.remember,true);
        assert.equal(typeof data.password,"string");
        return response({success:true,userId});
      }
      return response({success:true,userId});
    }
    if(url==="/api/auth-identity")
      return response({uid:identityUid,
        customToken:omitToken?"":mockToken});
    if(url==="/api/school-directory")
      return response({success:true,users});
    throw Error("Unexpected request "+url);
  }
  return {fetcher,calls,anonymous};
}
const good=mockFetch();
assert.equal(await verifySchoolSession(good.fetcher),own.id);
assert.equal(await createSchoolSession(good.fetcher,{
  username:" T001 ",password:"fake-unused-test-password"
}),own.id);
assert.equal(good.calls.at(-1).credentials,"same-origin");
assert.equal(JSON.parse(good.calls.at(-1).body).username,"T001");
let attempts=0;
const result=await establishPrivateSchoolIdentity({
  fetcher:good.fetcher,userId:own.id,
  signIn:async token=>{
    attempts++;assert.equal(token,mockToken);
    return {user:{uid:own.id,isAnonymous:false}};
  }
});
assert.equal(attempts,1);
assert.equal(result.profile.id,own.id);
assert.equal(result.users.length,2);
assert.ok(good.calls.some(x=>x.url==="/api/auth-identity"));
assert.ok(good.calls.some(x=>x.url==="/api/school-directory"));

async function rejected(options,reason,signIn=async()=>({user:{uid:own.id}})){
  await assert.rejects(establishPrivateSchoolIdentity({
    fetcher:mockFetch(options).fetcher,userId:own.id,signIn
  }),new RegExp(reason));
}
await rejected({identityUid:"TEST_ATTACKER_001"},"identity_mismatch");
await rejected({users:[director]},"school_profile_missing");
await rejected({omitToken:true},"identity_mismatch");
await rejected({users:[{...own,status:"inactive"}]},"school_profile_missing");
await rejected({users:[{...own,password:"NEVER"}]},"unsafe_school_directory");
await rejected({users:[{...own,passwordHash:"NEVER"}]},"unsafe_school_directory");
await rejected({}, "signed_in_identity_mismatch",async()=>({user:{uid:"TEST_ATTACKER_001"}}));
await rejected({}, "signed_in_identity_mismatch",async()=>({user:{uid:own.id,isAnonymous:true}}));
await assert.rejects(createSchoolSession(mockFetch({postOk:false}).fetcher,{
  username:"T001",password:"not-real"
}),/secure_session_unavailable/);
await assert.rejects(createSchoolSession(good.fetcher,{
  username:"",password:"not-real"
}),/invalid_login_form/);

const appSource=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
const server=readFileSync(new URL("../api/auth-identity.js",import.meta.url),"utf8");
const directory=readFileSync(new URL("../api/school-directory.js",import.meta.url),"utf8");
const secure=readFileSync(new URL("../src/secureSessionPreview.js",import.meta.url),"utf8");
assert.match(appSource,/if \(SECURE_LOGIN_PREVIEW\) return;/);
assert.match(appSource,/if \(SECURE_LOGIN_PREVIEW \|\| !firebaseUser\) return;/);
assert.match(appSource,/if\(SECURE_LOGIN_PREVIEW\)return;/);
assert.match(appSource,/createSchoolSession\(fetch,\{username,password\}\)/);
assert.match(appSource,/establishPrivateSchoolIdentity/);
assert.match(appSource,/signInWithCustomToken\(auth,token\)/);
assert.match(appSource,/!SECURE_LOGIN_PREVIEW && dbUsers\.length === 0/);
assert.match(secure,/VITE_BHS_SECURE_LOGIN_PREVIEW/);
assert.match(server,/VERCEL_ENV==="production"/);
assert.match(directory,/VERCEL_ENV==="production"/);
assert.doesNotMatch(secure,/signInAnonymously|getDocs\(|onSnapshot\(|passwordHash.*send/);
console.log("BHS real App preview-only server-auth integration checks passed (no Firebase connection)");
