import assert from "node:assert/strict";
import {isSchoolUid,canExchangeSchoolIdentity,schoolIdentityClaims} from "../shared/identityPolicy.js";
import handler from "../api/auth-identity.js";

const user={id:"U123",role:"teacher",status:"active",username:"teacher1"};
const credentialTag="123456789012345678901234";
const session={userId:"U123",credentialTag};
assert.equal(isSchoolUid("U123"),true);
assert.equal(isSchoolUid("U-123_ABC"),true);
for(const candidate of ["","/U1","hello/world","abc def",123, "a".repeat(129)])
  assert.equal(isSchoolUid(candidate),false,"cannot use unexpected UID");
assert.equal(canExchangeSchoolIdentity(session,user,credentialTag),true);
assert.equal(canExchangeSchoolIdentity(null,user,credentialTag),false);
assert.equal(canExchangeSchoolIdentity(session,{...user,status:"inactive"},credentialTag),false);
assert.equal(canExchangeSchoolIdentity(session,{...user,id:"U124"},credentialTag),false);
assert.equal(canExchangeSchoolIdentity(session,{...user,role:"unexpected"},credentialTag),false);
assert.equal(canExchangeSchoolIdentity(session,user,"different-credential-tag"),false);
assert.deepEqual(schoolIdentityClaims(),{bhsSchoolIdentity:true});
assert.equal(Object.hasOwn(schoolIdentityClaims(),"role"),false,"avoid trusting stale role claims");

function mockRes(){
  return {
    headers:{},statusCode:200,body:null,
    setHeader(k,v){this.headers[k]=v;return this},
    status(code){this.statusCode=code;return this},
    json(data){this.body=data;return this}
  };
}
delete process.env.BHS_ENABLE_CUSTOM_AUTH_PREVIEW;
let res=mockRes();
await handler({method:"GET",headers:{}},res);
assert.equal(res.statusCode,503,"new endpoint must be disabled by default");
assert.equal(res.body?.success,false);
assert.equal(res.headers["Cache-Control"],"no-store, private");

process.env.BHS_ENABLE_CUSTOM_AUTH_PREVIEW="true";
res=mockRes();
await handler({method:"POST",headers:{}},res);
assert.equal(res.statusCode,405,"custom token endpoint does not accept unthrottled credentials");
res=mockRes();
await handler({method:"GET",headers:{origin:"https://attacker.example",host:"bhs-edocument.vercel.app"}},res);
assert.equal(res.statusCode,403,"reject cross-origin requests");
res=mockRes();
await handler({method:"GET",headers:{}},res);
assert.equal(res.statusCode,503,"server secret + Firebase Admin must be configured");
delete process.env.BHS_ENABLE_CUSTOM_AUTH_PREVIEW;
console.log("BHS custom identity preparation, access and opt-in security tests passed");
