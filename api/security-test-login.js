/**
 * POST /api/security-test-login
 * TEST PROJECT ONLY. Authenticates synthetic users against a server-only
 * scrypt credential vault and mints test-Firebase custom tokens.
 * Nothing here queries the legacy BHS production Firestore database.
 */
import {normalizeUsername} from "../shared/username.js";
import {validExistingPassword,verifySchoolPassword,hashSchoolPassword} from "./_passwordSecurity.js";
import {testApiEnabled,testAdmin,secretKey,credentialLookupId,sameOriginPost} from "./_securityTestServer.js";

const MAX_BODY_BYTES=4096;
const WINDOW_MS=15*60*1000;
const MAX_ATTEMPTS=8;
function reply(res,status,payload){
  res.setHeader("Cache-Control","no-store, private");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Vary","Origin");
  return res.status(status).json(payload);
}
/** Transactional, per-username throttle. Not a replacement for an edge/WAF
 * IP rate limit before production use; sandbox login remains opt-in/off. */
export async function reserveAttempt(db,id,now=Date.now()){
  const ref=db.collection("bhs_security_test_login_limits").doc(id);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const previous=snap.exists?snap.data():{};
    const sameWindow=Number(previous.windowEndsAt)>now;
    const attempts=sameWindow?Number(previous.attempts||0):0;
    if(attempts>=MAX_ATTEMPTS)return false;
    tx.set(ref,{
      attempts:attempts+1,
      windowEndsAt:sameWindow?previous.windowEndsAt:now+WINDOW_MS,
      updatedAt:now
    });
    return true;
  });
}
export default async function handler(req,res){
  if(req.method!=="POST")return reply(res,405,{success:false,error:"Method not allowed"});
  if(!testApiEnabled())return reply(res,503,{success:false,error:"Sandbox login is disabled"});
  if(!sameOriginPost(req))return reply(res,403,{success:false,error:"Origin not allowed"});
  if(Number(req.headers?.["content-length"]||0)>MAX_BODY_BYTES)
    return reply(res,413,{success:false,error:"Request too large"});
  if(!String(req.headers?.["content-type"]||"").toLowerCase().startsWith("application/json"))
    return reply(res,415,{success:false,error:"JSON required"});
  const {username,password}=req.body||{};
  const normalized=normalizeUsername(username);
  if(normalized.length<1||normalized.length>120||!validExistingPassword(password))
    return reply(res,400,{success:false,error:"Invalid login data"});
  try{
    const {db,auth}=testAdmin();
    const id=credentialLookupId(normalized,secretKey());
    if(!await reserveAttempt(db,id))
      return reply(res,429,{success:false,error:"Too many attempts. Try again later"});
    const snap=await db.collection("bhs_security_test_credentials").doc(id).get();
    const account=snap.exists?snap.data():null;
    // Spend a comparable scrypt cost for unknown usernames.
    const good=account?await verifySchoolPassword(password,account.passwordHash):
      (await hashSchoolPassword("synthetic-unknown-user"),false);
    if(!good||account?.status!=="active"||!/^TEST_[A-Z0-9_]{1,80}$/.test(account.uid||""))
      return reply(res,401,{success:false,error:"Invalid username or password"});
    const profile=await db.collection("bhs_security_test_profiles").doc(account.uid).get();
    if(!profile.exists||profile.data().status!=="active"||
      profile.data().role!==account.role)
      return reply(res,401,{success:false,error:"Invalid username or password"});
    const token=await auth.createCustomToken(account.uid,{bhsSecurityTest:true});
    return reply(res,200,{
      success:true,customToken:token,uid:account.uid,
      profile:{name:String(profile.data().name||"บัญชีจำลอง"),role:account.role}
    });
  }catch(err){
    // Never log usernames, password values, tokens, credential JSON, or names.
    console.error("Security sandbox login unavailable",err?.code||"configuration");
    return reply(res,503,{success:false,error:"Security sandbox is not configured"});
  }
}
