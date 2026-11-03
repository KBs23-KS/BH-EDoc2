import assert from "node:assert/strict";
import {hashSchoolPassword,verifySchoolPassword,validStoredPasswordHash,validExistingPassword,credentialVaultApproved} from "../api/_passwordSecurity.js";
import {browserSchoolProfile,browserSchoolDirectory} from "../shared/schoolProfile.js";
import directoryHandler from "../api/school-directory.js";

assert.equal(validExistingPassword("123456"),true,"legacy passwords may migrate without user changes");
assert.equal(validExistingPassword(""),false);
assert.equal(validExistingPassword("a".repeat(129)),false);
const first=await hashSchoolPassword("รหัสผ่านเดิม 123456");
const second=await hashSchoolPassword("รหัสผ่านเดิม 123456");
assert.notEqual(first,second,"each account receives a unique random salt");
assert.equal(validStoredPasswordHash(first),true);
assert.equal(await verifySchoolPassword("รหัสผ่านเดิม 123456",first),true);
assert.equal(await verifySchoolPassword("incorrect",first),false);
assert.equal(await verifySchoolPassword("",first),false);
assert.equal(await verifySchoolPassword("anything","$broken"),false);
assert.equal(validStoredPasswordHash("bhs-scrypt-v1$wrong$hash"),false);
assert.equal(credentialVaultApproved({}),false,"never migrate to current unrestricted Firestore by default");
assert.equal(credentialVaultApproved({BHS_CREDENTIAL_VAULT_AUDITED:"true",VERCEL_ENV:"production"}),false,"production migration cannot be casually enabled");
assert.equal(credentialVaultApproved({BHS_CREDENTIAL_VAULT_AUDITED:"true",VERCEL_ENV:"preview"}),true);

const original={
  name:"ครูทดสอบ",username:"testschool",password:"123456",
  passwordHash:"$hidden",totpSecret:"do-not-send",
  role:"teacher",adminDept:"วิชาการ",subjectArea:"สังคมศึกษา",status:"active",
  privateKey:"private",sessionToken:"private",email:"private@school.invalid"
};
const teacher=browserSchoolProfile("U5",original,"teacher");
assert.equal(teacher.id,"U5");
assert.equal(teacher.name,original.name);
for(const secret of ["password","passwordHash","username","totpSecret","sessionToken","privateKey","email"])
  assert.equal(Object.hasOwn(teacher,secret),false,"teacher roster must omit sensitive field: "+secret);
const admin=browserSchoolProfile("U5",original,"admin");
assert.equal(admin.username,"testschool");
assert.equal(Object.hasOwn(admin,"password"),false,"even admins must never receive passwords");
const records=[
  {id:"U5",data:original},
  {id:"U6",data:{...original,status:"inactive",username:"disabled"}}
];
assert.equal(browserSchoolDirectory(records,"teacher").length,1);
assert.equal(browserSchoolDirectory(records,"admin").length,2);

function mockRes(){
  return {headers:{},statusCode:200,body:null,
    setHeader(k,v){this.headers[k]=v;return this},
    status(c){this.statusCode=c;return this},
    json(body){this.body=body;return this}};
}
const req={method:"GET",headers:{}};
delete process.env.BHS_ENABLE_SECURE_DIRECTORY_PREVIEW;
let res=mockRes();
await directoryHandler(req,res);
assert.equal(res.statusCode,503,"password-free roster is disabled by default");
assert.equal(res.headers["Cache-Control"],"no-store, private");
process.env.BHS_ENABLE_SECURE_DIRECTORY_PREVIEW="true";
process.env.VERCEL_ENV="production";
res=mockRes();await directoryHandler(req,res);
assert.equal(res.statusCode,503,"production is explicitly excluded");
delete process.env.VERCEL_ENV;
res=mockRes();await directoryHandler({method:"POST",headers:{}},res);
assert.equal(res.statusCode,405);
res=mockRes();await directoryHandler({method:"GET",headers:{origin:"https://evil.example",host:"bhs-edocument.vercel.app"}},res);
assert.equal(res.statusCode,403);
res=mockRes();await directoryHandler(req,res);
assert.equal(res.statusCode,503,"a working server session service is a prerequisite");
delete process.env.BHS_ENABLE_SECURE_DIRECTORY_PREVIEW;
console.log("Private credential hashing, sanitized directory and preview gate checks passed");
