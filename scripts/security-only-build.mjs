/** Isolated Vercel project ONLY. Never build the real BHS App via this command. */
import {execFileSync} from "node:child_process";
import {useIsolatedTestSite,LOGIN_TEST_BRANCH,TEST_PROJECT_ID} from "./security-test-build-guard.mjs";

export const EXPECTED_TEST_VERCEL_PROJECT="prj_LLGrwc1RXHkJCims2bcRNvdAr3lF";
export function approvedSecurityPreview(env=process.env){
  return env.VERCEL==="1" &&
    env.VERCEL_ENV==="preview" &&
    env.VERCEL_GIT_COMMIT_REF===LOGIN_TEST_BRANCH &&
    env.BHS_SECURITY_TEST_DEPLOY_TARGET===TEST_PROJECT_ID &&
    env.BHS_SECURITY_TEST_VERCEL_PROJECT_ID===EXPECTED_TEST_VERCEL_PROJECT &&
    (!env.VERCEL_PROJECT_ID || env.VERCEL_PROJECT_ID===EXPECTED_TEST_VERCEL_PROJECT) &&
    useIsolatedTestSite(env);
}
if(process.argv[1]&&process.argv[1].replace(/\\/g,"/").endsWith("/security-only-build.mjs")){
  if(!approvedSecurityPreview())throw new Error("Refusing build outside approved isolated Vercel Preview");
  execFileSync(process.platform==="win32"?"npm.cmd":"npm",["run","build"],{stdio:"inherit",env:process.env});
}
