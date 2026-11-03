/**
 * Server-only credential hashing primitives for the planned school account
 * migration. NOT USED BY THE EXISTING LOGIN and not safe to persist in the
 * current Firestore database while its blanket authenticated-read rule exists.
 *
 * scrypt is deliberately memory-hard; old teacher passwords are accepted
 * unchanged during migration. New password policy is a separate decision.
 */
import {randomBytes,scrypt as scryptCallback,timingSafeEqual} from "node:crypto";
import {promisify} from "node:util";
const scrypt=promisify(scryptCallback);
const PREFIX="bhs-scrypt-v1";
const OPTIONS={N:16384,r:8,p:1,maxmem:64*1024*1024};
const KEY_BYTES=32;
const SALT_BYTES=16;

export function validExistingPassword(password){
  return typeof password==="string" && password.length>=1 && password.length<=128 &&
    Buffer.byteLength(password,"utf8")<=512;
}
export function validStoredPasswordHash(stored){
  if(typeof stored!=="string")return false;
  const [prefix,salt,hash,...extra]=stored.split("$");
  if(prefix!==PREFIX||extra.length||!/^[0-9a-f]{32}$/.test(salt||"")||!/^[0-9a-f]{64}$/.test(hash||""))return false;
  return true;
}
export async function hashSchoolPassword(password){
  if(!validExistingPassword(password))throw new Error("Invalid school password");
  const salt=randomBytes(SALT_BYTES);
  const digest=await scrypt(Buffer.from(password,"utf8"),salt,KEY_BYTES,OPTIONS);
  return [PREFIX,salt.toString("hex"),digest.toString("hex")].join("$");
}
export async function verifySchoolPassword(password,stored){
  if(!validExistingPassword(password)||!validStoredPasswordHash(stored))return false;
  const [,salt,expected]=stored.split("$");
  const actual=await scrypt(Buffer.from(password,"utf8"),Buffer.from(salt,"hex"),KEY_BYTES,OPTIONS);
  return timingSafeEqual(Buffer.from(expected,"hex"),actual);
}
/**
 * A credential vault must be in a separately secured datastore or the
 * school's existing blanket Firestore rule must have been REPLACED and fully
 * audited. Returning false is the safe default.
 *
 * This is a guard for future migration scripts, not proof of correct rules.
 */
export function credentialVaultApproved(env=process.env){
  return env.BHS_CREDENTIAL_VAULT_AUDITED==="true" && env.VERCEL_ENV!=="production";
}
