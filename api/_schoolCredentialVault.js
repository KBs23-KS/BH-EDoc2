/**
 * PRIVATE credential store for the exact isolated BHS test project.
 *
 * The vault is a separate Firestore collection with explicit client DENY
 * rules. DO NOT run this with the existing permissive production rules.
 * Passwords can remain unchanged, including historical short passwords.
 *
 * Importing this module does NOT connect to or modify Firebase.
 */
import {randomBytes} from "node:crypto";
import {FieldValue} from "firebase-admin/firestore";
import {hashSchoolPassword,verifySchoolPassword,validExistingPassword}
  from "./_passwordSecurity.js";

export const VAULT_COLLECTION="bhs_private_credentials";
export const VAULT_TEST_PROJECT="bhs-edoc-security-test";
export const VAULT_VERSION=1;
const TEST_UID=/^TEST_[A-Za-z0-9_-]{1,120}$/;

export function credentialVaultMode(env=process.env){
  return env.VERCEL_ENV!=="production" &&
    env.BHS_SERVER_ISOLATED_PREVIEW==="true" &&
    env.BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW==="true" &&
    env.BHS_CREDENTIAL_VAULT_AUDITED==="true" &&
    // No real test or school Firebase writes are authorized in this stage.
    env.FIRESTORE_EMULATOR_HOST==="127.0.0.1:8099";
}
export function assertCredentialVaultBoundary({projectId,env=process.env}){
  if(!credentialVaultMode(env)||
     projectId!==VAULT_TEST_PROJECT||
     (env.VERCEL_ENV||"")==="production")
    throw new Error("credential_vault_isolated_test_only");
}
export function vaultDocument(db,uid){
  if(!TEST_UID.test(uid||""))
    throw new Error("credential_vault_test_uid_required");
  return db.collection(VAULT_COLLECTION).doc(uid);
}
export function existingLegacyPassword(record){
  // Exactly matches the historical BHS login policy: an absent or empty
  // password behaves like 123456; no actual password is printed to a log.
  const value=record?.password?String(record.password):"123456";
  if(!validExistingPassword(value))throw new Error("invalid_legacy_password");
  return value;
}
export async function verifyPrivateSchoolPassword({db,projectId,user,password,env=process.env}){
  assertCredentialVaultBoundary({projectId,env});
  if(!user||user.status==="inactive"||!TEST_UID.test(user.id||"")||
     typeof user.credentialVersion!=="string"||
     user.credentialVersion.length<24||
     typeof password!=="string")return false;
  const snap=await vaultDocument(db,user.id).get();
  if(!snap.exists)return false;
  const record=snap.data();
  if(record?.version!==VAULT_VERSION||
     record.credentialVersion!==user.credentialVersion||
     record.disabled===true)return false;
  return verifySchoolPassword(password,record.passwordHash);
}

/**
 * ONE-TIME synthetic rehearsal only. Every profile+vault write is atomic.
 * Test project, explicit audit flag, TEST_UID and zero existing vault records
 * are mandatory. No retries with silently changed credentials.
 */
export async function migrateSyntheticUserCredential({
  db,projectId,profileRef,uid,env=process.env
}){
  assertCredentialVaultBoundary({projectId,env});
  if(!TEST_UID.test(uid||"")||
     profileRef?.id!==uid ||
     profileRef?.path!=="artifacts/bhs-edoc-app/public/data/bhs_users/"+uid)
    throw new Error("synthetic_profile_path_required");
  const vaultRef=vaultDocument(db,uid);
  // Hash outside the transaction (which may retry). The only plaintext
  // exists in server memory; never returns it or emits it to logs.
  const before=await profileRef.get();
  if(!before.exists)throw new Error("account_missing");
  const candidate=before.data();
  if(candidate?.credentialVersion)
    throw new Error("account_already_migrated");
  const password=existingLegacyPassword(candidate);
  const passwordHash=await hashSchoolPassword(password);
  const credentialVersion=randomBytes(24).toString("hex");
  await db.runTransaction(async tx=>{
    const [current,existing]=await Promise.all([
      tx.get(profileRef),tx.get(vaultRef)
    ]);
    if(!current.exists||existing.exists)throw new Error("vault_conflict");
    const live=current.data();
    if(live.credentialVersion||
       existingLegacyPassword(live)!==password)
      throw new Error("credentials_changed_during_migration");
    tx.create(vaultRef,{
      version:VAULT_VERSION,passwordHash,credentialVersion,
      disabled:live.status==="inactive"
    });
    tx.update(profileRef,{
      password:FieldValue.delete(),
      credentialVersion
    });
  });
  return {uid,migrated:true};
}
