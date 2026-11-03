import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {testApiEnabled,testAdminCredentials,credentialLookupId,sameOriginPost,TEST_PROJECT_ID,TEST_BRANCH} from "../api/_securityTestServer.js";
import {hashSchoolPassword,verifySchoolPassword} from "../api/_passwordSecurity.js";
import loginHandler from "../api/security-test-login.js";
import {SYNTHETIC_USERS,syntheticUser,syntheticEmail} from "../security-test/syntheticUsers.js";
import {seedTargetApproved} from "../scripts/seed-test-auth-adc.mjs";

assert.equal(SYNTHETIC_USERS.length,7);
assert.equal(syntheticUser(" TEST_TEACHER ")?.uid,"TEST_TEACHER_001");
assert.equal(syntheticUser("teacher1"),null);
assert.equal(syntheticEmail("test_admin"),"test_admin@sandbox.bhs-edoc-security-test.example");
assert.equal(syntheticEmail("admin"),null);
assert.equal(seedTargetApproved({
  GOOGLE_CLOUD_PROJECT:"bhs-edoc-security-test",
  BHS_SECURITY_TEST_SEED_CONFIRM:"bhs-edoc-security-test"
}),true);
assert.equal(seedTargetApproved({
  GOOGLE_CLOUD_PROJECT:"bhs-edoc-2",
  BHS_SECURITY_TEST_SEED_CONFIRM:"bhs-edoc-security-test"
}),false);
assert.equal(seedTargetApproved({
  GOOGLE_CLOUD_PROJECT:"bhs-edoc-security-test",
  GCLOUD_PROJECT:"bhs-edoc-2",
  BHS_SECURITY_TEST_SEED_CONFIRM:"bhs-edoc-security-test"
}),false);
assert.equal(seedTargetApproved({
  VERCEL:"1",GOOGLE_CLOUD_PROJECT:"bhs-edoc-security-test",
  BHS_SECURITY_TEST_SEED_CONFIRM:"bhs-edoc-security-test"
}),false);
const testEnv={
  VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:TEST_BRANCH,
  BHS_SECURITY_TEST_DEPLOY_TARGET:TEST_PROJECT_ID,BHS_SECURITY_TEST_API_ENABLED:"true"
};
assert.equal(testApiEnabled(testEnv),true);
for(const changed of [
  {VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:"main"},
  {VERCEL_GIT_COMMIT_REF:"security/isolated-firebase-test-20261103"},
  {BHS_SECURITY_TEST_DEPLOY_TARGET:"bhs-edoc-2"},{BHS_SECURITY_TEST_API_ENABLED:"false"}
])assert.equal(testApiEnabled({...testEnv,...changed}),false);
assert.equal(testApiEnabled({}),false);
assert.throws(()=>testAdminCredentials(testEnv),/service account/);
assert.throws(()=>testAdminCredentials({...testEnv,BHS_FIREBASE_SECURITY_TEST_SERVICE_ACCOUNT_JSON:JSON.stringify({
  type:"service_account",project_id:"bhs-edoc-2",private_key:"fake",client_email:"test@fake.iam.gserviceaccount.com"
})}),/non-test/);
assert.equal(sameOriginPost({headers:{origin:"https://test.example",host:"test.example"}}),true);
assert.equal(sameOriginPost({headers:{origin:"https://evil.example",host:"test.example"}}),false);
assert.equal(sameOriginPost({headers:{origin:"http://test.example",host:"test.example"}}),false);
assert.notEqual(credentialLookupId("test_teacher","a".repeat(32)),credentialLookupId("test_director","a".repeat(32)));
assert.equal(credentialLookupId("TEST_TEACHER","a".repeat(32)),credentialLookupId("test_teacher","a".repeat(32)));
const hash=await hashSchoolPassword("synthetic-only-password");
assert.equal(await verifySchoolPassword("synthetic-only-password",hash),true);
assert.equal(await verifySchoolPassword("incorrect",hash),false);
const res=()=>({headers:{},statusCode:200,body:null,setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(x){this.body=x;return this}});
let mock=res();
await loginHandler({method:"POST",headers:{origin:"https://test.example",host:"test.example","content-type":"application/json"},body:{username:"test_teacher",password:"test"}},mock);
assert.equal(mock.statusCode,503,"login API must remain disabled in the build environment");
assert.equal(mock.headers["Cache-Control"],"no-store, private");
assert.equal(Object.hasOwn(mock.body||{},"customToken"),false);
mock=res();
await loginHandler({method:"GET",headers:{}},mock);
assert.equal(mock.statusCode,405);
const rules=readFileSync(new URL("../security/firestore-security-test.rules",import.meta.url),"utf8");
assert.match(rules,/request.auth.token.bhsSecurityTest == true/);
assert.match(rules,/match \/bhs_security_test_credentials\/\{id\}/);
assert.match(rules,/allow read, write: if false/);
assert.match(rules,/request.resource.data.diff\(resource.data\).affectedKeys\(\).hasOnly\(\['status'\]\)/);
assert.doesNotMatch(rules,/allow\s+read,\s*write:\s*if\s*true/);
assert.doesNotMatch(rules,/request.auth\s*!=\s*null\s*;/,"no blanket auth access");
const site=readFileSync(new URL("../security-test/main.js",import.meta.url),"utf8");
assert.match(site,/signInWithEmailAndPassword/);
assert.match(site,/bhsSecurityTest/);
assert.match(site,/signOut/);
assert.doesNotMatch(site,/src\/App|signInAnonymously|bhs-edoc-2\.firebaseapp\.com/);

const cloudSeeder=readFileSync(new URL("../scripts/seed-test-auth-adc.mjs",import.meta.url),"utf8");
assert.match(cloudSeeder,/applicationDefault\(\)/);
assert.match(cloudSeeder,/setCustomUserClaims/);
assert.doesNotMatch(cloudSeeder,/bhs-edoc-2|BHS_FIREBASE_SERVICE_ACCOUNT_JSON|process\.env\.FIREBASE_PRIVATE_KEY/);
assert.doesNotMatch(site,/security-test-login|signInAnonymously|\.\.\/src\/App/);

console.log("Synthetic login, Firebase Auth fallback, seed safety and strict rules checks passed");
