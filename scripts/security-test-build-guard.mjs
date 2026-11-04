// Build safety gate: a preview from the normal Vercel project must NOT publish
// the legacy BHS application (which has a hard-coded production Firebase config).
export const TEST_PROJECT_ID = "bhs-edoc-security-test";
export const TEST_BRANCH = "security/isolated-firebase-test-20261103";
export const LOGIN_TEST_BRANCH = "security/sandbox-login-firestore-20261103";

export function useIsolatedTestSite(env = {}) {
  const target = String(env.BHS_SECURITY_TEST_DEPLOY_TARGET || "").trim();
  const onVercel = env.VERCEL === "1" || env.VERCEL === "true";
  const ref = String(env.VERCEL_GIT_COMMIT_REF || "");
  const environment = String(env.VERCEL_ENV || "");
  const onTestBranch = [TEST_BRANCH, LOGIN_TEST_BRANCH].includes(ref);

  if (target && target !== TEST_PROJECT_ID) {
    throw new Error("Unsafe Firebase target; expected isolated bhs-edoc-security-test.");
  }
  if (onVercel && (environment !== "production" || onTestBranch) && target !== TEST_PROJECT_ID) {
    throw new Error("Blocked: no isolated Firebase target. Do NOT deploy legacy app from security-test PR.");
  }
  if (onVercel && target === TEST_PROJECT_ID &&
      (environment !== "preview" || !onTestBranch)) {
    throw new Error("Blocked: security test deployment requires Preview on the isolated branch.");
  }
  return target === TEST_PROJECT_ID;
}
