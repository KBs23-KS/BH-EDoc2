/**
 * Firebase Admin adapter for SYNTHETIC test accounts only.
 * Fail closed: no default app, no prod service account, no school API imports.
 * This code must NOT be used for real-school login until a separate migration.
 */
import {createHmac} from "node:crypto";
import {getApps,initializeApp,cert} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {normalizeUsername} from "../shared/username.js";

export const TEST_PROJECT_ID="bhs-edoc-security-test";
export const TEST_BRANCH="security/sandbox-login-firestore-20261103";

export function testApiEnabled(env=process.env){
  return env.VERCEL==="1" &&
    env.VERCEL_ENV==="preview" &&
    env.VERCEL_GIT_COMMIT_REF===TEST_BRANCH &&
    env.BHS_SECURITY_TEST_DEPLOY_TARGET===TEST_PROJECT_ID &&
    env.BHS_SECURITY_TEST_API_ENABLED==="true";
}
export function testAdminCredentials(env=process.env){
  if(!testApiEnabled(env))throw new Error("Security sandbox API disabled");
  const raw=env.BHS_FIREBASE_SECURITY_TEST_SERVICE_ACCOUNT_JSON;
  if(!raw||raw.length>20000)throw new Error("Security sandbox service account not configured");
  let credentials;
  try{credentials=JSON.parse(raw);}catch{throw new Error("Invalid test service account JSON");}
  if(credentials.project_id!==TEST_PROJECT_ID||credentials.type!=="service_account"||
     typeof credentials.private_key!=="string"||typeof credentials.client_email!=="string"||
     !credentials.client_email.endsWith(".iam.gserviceaccount.com"))
    throw new Error("Blocked: non-test Firebase Admin credentials");
  return credentials;
}
export function secretKey(env=process.env){
  const secret=env.BHS_SECURITY_TEST_INDEX_SECRET;
  if(typeof secret!=="string"||Buffer.byteLength(secret,"utf8")<32)
    throw new Error("Security sandbox index secret not configured");
  return secret;
}
export function credentialLookupId(username,secret){
  const normalized=normalizeUsername(username);
  if(!normalized||normalized.length>120||!secret)throw new Error("Invalid sandbox username");
  return createHmac("sha256",secret).update(normalized).digest("hex");
}
export function testAdmin(env=process.env){
  const credentials=testAdminCredentials(env);
  const existing=getApps().find(app=>app.name==="bhs-isolated-security-test");
  if(existing&&existing.options.projectId!==TEST_PROJECT_ID)
    throw new Error("Firebase Admin test app project mismatch");
  const app=existing||initializeApp({
    credential:cert(credentials),projectId:TEST_PROJECT_ID
  },"bhs-isolated-security-test");
  return {db:getFirestore(app),auth:getAuth(app)};
}
export function sameOriginPost(req){
  const origin=String(req.headers?.origin||"");
  const host=String(req.headers?.["x-forwarded-host"]||req.headers?.host||"").toLowerCase();
  if(!origin||!host)return false;
  try{
    const u=new URL(origin);
    return u.protocol==="https:"&&u.host.toLowerCase()===host;
  }catch{return false;}
}
