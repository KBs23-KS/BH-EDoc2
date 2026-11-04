import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { useIsolatedTestSite, TEST_BRANCH, LOGIN_TEST_BRANCH, TEST_PROJECT_ID } from "../scripts/security-test-build-guard.mjs";
import { verifyTestProject, firebaseConfig } from "../security-test/firebaseConfig.js";
import {approvedSecurityPreview, EXPECTED_TEST_VERCEL_PROJECT} from "../scripts/security-only-build.mjs";

const env={
  VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:LOGIN_TEST_BRANCH,
  BHS_SECURITY_TEST_DEPLOY_TARGET:TEST_PROJECT_ID,
  BHS_SECURITY_TEST_VERCEL_PROJECT_ID:EXPECTED_TEST_VERCEL_PROJECT
};
assert.equal(approvedSecurityPreview(env),true);
assert.equal(approvedSecurityPreview({...env,VERCEL_ENV:"production"}),false);
assert.equal(approvedSecurityPreview({...env,VERCEL_GIT_COMMIT_REF:"main"}),false);
assert.equal(approvedSecurityPreview({...env,BHS_SECURITY_TEST_VERCEL_PROJECT_ID:"prj_actual_production"}),false);
assert.equal(approvedSecurityPreview({...env,VERCEL_PROJECT_ID:"prj_actual_production"}),false);
assert.equal(approvedSecurityPreview({}),false);
const local = {};
assert.equal(useIsolatedTestSite(local), false, "ordinary build keeps its normal entry");
assert.equal(useIsolatedTestSite({BHS_SECURITY_TEST_DEPLOY_TARGET:TEST_PROJECT_ID}), true);
assert.throws(()=>useIsolatedTestSite({BHS_SECURITY_TEST_DEPLOY_TARGET:"bhs-edoc-2"}), /Unsafe Firebase target/);
assert.throws(()=>useIsolatedTestSite({VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:TEST_BRANCH}), /Blocked/);
assert.throws(()=>useIsolatedTestSite({VERCEL:"1",VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:TEST_BRANCH}), /Blocked/);
assert.throws(()=>useIsolatedTestSite({VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"main",BHS_SECURITY_TEST_DEPLOY_TARGET:TEST_PROJECT_ID}), /Blocked/);
assert.throws(()=>useIsolatedTestSite({VERCEL:"1",VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:TEST_BRANCH,BHS_SECURITY_TEST_DEPLOY_TARGET:TEST_PROJECT_ID}), /Blocked/);
assert.equal(useIsolatedTestSite({VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:TEST_BRANCH,BHS_SECURITY_TEST_DEPLOY_TARGET:TEST_PROJECT_ID}),true);
assert.throws(()=>useIsolatedTestSite({VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:LOGIN_TEST_BRANCH}), /Blocked/);
assert.throws(()=>useIsolatedTestSite({VERCEL:"1",VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:LOGIN_TEST_BRANCH,BHS_SECURITY_TEST_DEPLOY_TARGET:TEST_PROJECT_ID}), /Blocked/);
assert.equal(useIsolatedTestSite({VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:LOGIN_TEST_BRANCH,BHS_SECURITY_TEST_DEPLOY_TARGET:TEST_PROJECT_ID}),true);
assert.equal(useIsolatedTestSite({VERCEL:"1",VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:"main"}), false);

assert.equal(verifyTestProject(firebaseConfig).projectId,TEST_PROJECT_ID);
assert.throws(()=>verifyTestProject({...firebaseConfig,projectId:"bhs-edoc-2"}), /mismatch/);
assert.throws(()=>verifyTestProject({...firebaseConfig,authDomain:"bhs-edoc-2.firebaseapp.com"}), /mismatch/);
assert.throws(()=>verifyTestProject({...firebaseConfig,appId:"1:wrong:web:wrong"}), /mismatch/);

const vite = readFileSync(new URL("../vite.config.js",import.meta.url),"utf8");
const html = readFileSync(new URL("../security-test/index.html",import.meta.url),"utf8");
const entry = readFileSync(new URL("../security-test/main.js",import.meta.url),"utf8");
assert.match(vite,/root: 'security-test'/);
assert.match(vite,/publicDir: false/);
assert.match(html,/\.\/main\.js/);
assert.doesNotMatch(entry,/\.\.\/src\/App|signInAnonymously|deleteDoc\(/);
assert.match(entry,/TEST_FLOW_/);
assert.match(entry,/flowCreate\.addEventListener/);
assert.match(entry,/flowSend\.addEventListener/);
assert.match(entry,/flowApprove\.addEventListener/);
assert.match(entry,/flowAcknowledge\.addEventListener/);
assert.match(entry,/verifyTestProject\(\)/);
assert.match(entry,/permission-denied/);
console.log("Isolated Firebase security test configuration and Vercel fail-closed checks passed");
