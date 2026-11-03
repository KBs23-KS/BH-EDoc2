import assert from "node:assert/strict";
import {auditLegacyAccountReadiness,accountMigrationReady} from "../shared/credentialMigrationAudit.js";

const accounts=[
  {id:"U01",data:{username:"DIRECTOR",password:"different",role:"director",status:"active"}},
  {id:"U02",data:{username:"teacher",password:"",role:"teacher",status:"active"}},
  {id:"U03",data:{username:"teacher2",role:"teacher",status:"inactive"}},
];
const safe=auditLegacyAccountReadiness(accounts);
assert.deepEqual({...safe},{
  totalAccounts:3,activeCount:2,inactiveCount:1,defaultPasswordCount:2,
  nondefaultPasswordCount:1,missingUsernameCount:0,invalidRoleCount:0,
  invalidUidCount:0,duplicateUsernameAccounts:0,duplicateUidAccounts:0
});
assert.equal(accountMigrationReady(safe),true);
const output=JSON.stringify(safe);
for(const token of ["DIRECTOR","teacher","different","123456"])
  assert.equal(output.includes(token),false,"audit must never reveal credentials or usernames");

const issues=auditLegacyAccountReadiness([
  ...accounts,
  {id:"U04",data:{username:"Teacher",role:"teacher",status:"active"}},
  {id:"bad/uid",data:{username:"",role:"unknown",status:"active"}}
]);
assert.equal(issues.duplicateUsernameAccounts,2);
assert.equal(issues.missingUsernameCount,1);
assert.equal(issues.invalidUidCount,1);
assert.equal(issues.invalidRoleCount,1);
assert.equal(accountMigrationReady(issues),false);
assert.equal(accountMigrationReady(auditLegacyAccountReadiness([])),false);
assert.throws(()=>auditLegacyAccountReadiness(null),TypeError);
console.log("No-secret password migration readiness audit tests passed");
