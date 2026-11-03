/**
 * Privacy-preserving readiness analysis for a future one-time migration.
 * The output NEVER includes usernames, names, password values or hashes.
 * All tests use synthetic users; this module does not read/write Firestore.
 */
import {normalizeUsername} from "./username.js";
import {isSchoolUid} from "./identityPolicy.js";

export function auditLegacyAccountReadiness(accounts){
  if(!Array.isArray(accounts))throw new TypeError("accounts must be an array");
  const usernameCounts=new Map(), uidCounts=new Map();
  const validRoles=new Set(["admin","director","deputy","clerk","teacher"]);
  let defaultPasswordCount=0,missingUsernameCount=0,invalidRoleCount=0,invalidUidCount=0,
    activeCount=0,inactiveCount=0,nondefaultPasswordCount=0;

  for(const item of accounts){
    const account=item?.data||item||{};
    const uid=String(item?.id??account.id??"");
    if(!isSchoolUid(uid))invalidUidCount++;
    else uidCounts.set(uid,(uidCounts.get(uid)||0)+1);
    const username=normalizeUsername(account.username);
    if(!username)missingUsernameCount++;
    else usernameCounts.set(username,(usernameCounts.get(username)||0)+1);
    if(!validRoles.has(account.role))invalidRoleCount++;
    if(account.status==="inactive")inactiveCount++;
    else activeCount++;
    // The current BHS legacy login intentionally treats empty passwords as 123456.
    if(!account.password||account.password==="123456")defaultPasswordCount++;
    else nondefaultPasswordCount++;
  }
  return Object.freeze({
    totalAccounts:accounts.length,
    activeCount,inactiveCount,
    defaultPasswordCount,nondefaultPasswordCount,
    missingUsernameCount,invalidRoleCount,invalidUidCount,
    duplicateUsernameAccounts:[...usernameCounts.values()].filter(n=>n>1).reduce((a,n)=>a+n,0),
    duplicateUidAccounts:[...uidCounts.values()].filter(n=>n>1).reduce((a,n)=>a+n,0)
  });
}
export function accountMigrationReady(summary){
  return Boolean(summary&&summary.totalAccounts>0&&
    summary.missingUsernameCount===0&&summary.invalidRoleCount===0&&
    summary.invalidUidCount===0&&summary.duplicateUsernameAccounts===0&&summary.duplicateUidAccounts===0);
}
