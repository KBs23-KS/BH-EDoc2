import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeUsername,findUniqueUsernameAccount,usernameTakenByAnother} from "../shared/username.js";

const users=[
  {id:"U1",username:"T001",password:"SecretAbC",role:"teacher",status:"active"},
  {id:"U2",username:"p002",password:"DifferentCase",role:"teacher",status:"active"},
  {id:"U3",username:"Director",password:"AdminPass",role:"director",status:"active"},
];

assert.equal(normalizeUsername("  T001  "),"t001");
assert.equal(normalizeUsername("t001"),"t001");
assert.equal(normalizeUsername(null),"");
assert.equal(findUniqueUsernameAccount(users,"T001")?.id,"U1","Exact case login matches");
assert.equal(findUniqueUsernameAccount(users,"t001")?.id,"U1","Lowercase login matches uppercase account");
assert.equal(findUniqueUsernameAccount(users,"  t001  ")?.id,"U1","Whitespace is ignored");
assert.equal(findUniqueUsernameAccount(users,"P002")?.id,"U2","Uppercase login matches lowercase account");
assert.equal(findUniqueUsernameAccount(users,"director")?.id,"U3","Director login matches regardless of case");
assert.equal(findUniqueUsernameAccount(users,"wrong"),null,"Unknown username stays invalid");
assert.equal(findUniqueUsernameAccount(users," "),null,"Empty username stays invalid");
assert.equal(findUniqueUsernameAccount([...users,{id:"U4",username:"t001"}],"T001"),null,"Case-colliding legacy accounts fail closed");
assert.equal(usernameTakenByAnother(users,"t001","U2"),true,"Admin cannot create case-only duplicate");
assert.equal(usernameTakenByAnother(users,"  T001  ","U1"),false,"Editing own username casing is allowed");
assert.equal(usernameTakenByAnother(users,"T003",null),false,"Unclaimed username is available");
assert.notEqual(users[0].password,"secretabc","Passwords remain case-sensitive");

const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
const server=readFileSync(new URL("../api/_signatureServer.js",import.meta.url),"utf8");
const appSession=readFileSync(new URL("../api/app-session.js",import.meta.url),"utf8");
const signingSession=readFileSync(new URL("../api/signing-session.js",import.meta.url),"utf8");
assert.ok(app.includes('findUniqueUsernameAccount(dbUsers, username)'),"Browser login uses shared case-insensitive matching");
assert.ok(app.includes('usernameTakenByAnother(dbUsers, formData.username, formData.id)'),"Admin duplicate guard ignores case");
assert.ok(app.includes('if (password !== userPassword)'),"Browser retains case-sensitive password validation");
assert.ok(server.includes('findUniqueUsernameAccount('),"Server lookup uses shared normalized matching");
assert.ok(server.includes('collection(COLLECTION+"/bhs_users").get()'),"Legacy usernames without a normalized index remain findable");
assert.ok(!server.includes('.where("username","==",username)'),"Server must not use an exact-case Firestore equality query");
assert.ok(appSession.includes('findByUsername(username.trim())'),"Persistent login still uses server identity");
assert.ok(appSession.includes('matchesLegacyPassword(password,user)'),"Persistent session independently checks original-case password");
assert.ok(signingSession.includes('findByUsername(username.trim())'),"Signing reauthentication still uses server identity");
assert.ok(signingSession.includes('matchesLegacyPassword(password,user)'),"Signing password remains case-sensitive");
console.log("Case-insensitive username and case-sensitive password regression PASS");
