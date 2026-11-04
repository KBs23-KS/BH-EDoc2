/**
 * LOCAL FIRESTORE EMULATOR ONLY — no calls to any real Firebase project.
 * Verify legacy username/password preservation, private scrypt hashes,
 * atomic removal of plaintext, one-time migration and fail-closed rules.
 */
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import appSessionHandler from "../api/app-session.js";
import {matchesLegacyPassword} from "../api/_signatureServer.js";
import {initializeApp as initializeAdmin,deleteApp as deleteAdmin}
  from "firebase-admin/app";
import {getFirestore as getAdminFirestore} from "firebase-admin/firestore";
import {initializeApp as initializeClient,deleteApp as deleteClient}
  from "firebase/app";
import {getFirestore as getClientFirestore,connectFirestoreEmulator,doc,getDoc}
  from "firebase/firestore";
import {
  credentialVaultMode,assertCredentialVaultBoundary,
  migrateSyntheticUserCredential,verifyPrivateSchoolPassword,
  VAULT_COLLECTION
} from "../api/_schoolCredentialVault.js";
import {appSessionFingerprint,makeAppSession,readAppSession}
  from "../api/_signatureServer.js";
const PROJECT="bhs-edoc-security-test";
if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8099")
  throw new Error("STOP: live Firebase data must never be used");
const app=initializeAdmin({projectId:PROJECT},"synthetic-credential-vault-test");
const db=getAdminFirestore(app);
const root="artifacts/bhs-edoc-app/public/data/bhs_users";
const env={
  VERCEL_ENV:"preview",FIRESTORE_EMULATOR_HOST:"127.0.0.1:8099",
  BHS_SERVER_ISOLATED_PREVIEW:"true",
  BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW:"true",
  BHS_CREDENTIAL_VAULT_AUDITED:"true"
};
const old=Object.fromEntries(["VERCEL_ENV","BHS_TEST_SESSION_SECRET",
  "BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON",
  "BHS_SERVER_ISOLATED_PREVIEW",
  "BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW",
  "BHS_CREDENTIAL_VAULT_AUDITED"].map(k=>[k,process.env[k]]));
Object.assign(process.env,{
  VERCEL_ENV:"preview",
  BHS_TEST_SESSION_SECRET:"TEST_SECRET_NOT_REAL_".repeat(4),
  BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON:"TEST_ONLY_DO_NOT_PARSE",
  BHS_SERVER_ISOLATED_PREVIEW:"true",
  BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW:"true",
  BHS_CREDENTIAL_VAULT_AUDITED:"true"
});
let client;
try{
  assert.equal(credentialVaultMode(env),true);
  assert.throws(()=>assertCredentialVaultBoundary({
    projectId:"bhs-edoc-2",env
  }),/isolated_test_only/);
  assert.throws(()=>assertCredentialVaultBoundary({
    projectId:PROJECT,env:{...env,VERCEL_ENV:"production"}
  }),/isolated_test_only/);
  assert.throws(()=>assertCredentialVaultBoundary({
    projectId:PROJECT,env:{...env,FIRESTORE_EMULATOR_HOST:""}
  }),/isolated_test_only/);

  const cases=[
    {uid:"TEST_USER_TEACHER_001",username:"t001",password:"a",role:"teacher"},
    {uid:"TEST_USER_DIRECTOR_001",username:"DIRECTOR",password:"school-unchanged-123",role:"director"},
    {uid:"TEST_USER_CLERK_001",username:"clerk",password:"",role:"clerk"},
    {uid:"TEST_USER_ADMIN_001",username:"admin",password:"รหัสเดิมใช้ได้",role:"admin"}
  ];
  let migrated=0;
  for(const item of cases){
    const ref=db.doc(root+"/"+item.uid);
    await ref.set({
      username:item.username,name:"บัญชีจำลองเท่านั้น",role:item.role,
      status:"active",password:item.password,adminDept:"-",subjectArea:"-"
    });
    const before=await ref.get();
    const oldStamp=appSessionFingerprint(before.data());
    const result=await migrateSyntheticUserCredential({
      db,profileRef:ref,uid:item.uid,projectId:PROJECT,env
    });
    assert.equal(result.migrated,true);
    migrated++;
    const latest=await ref.get(),data=latest.data();
    assert.equal(latest.exists,true);
    assert.equal(data.username,item.username,"username must remain unchanged");
    assert.equal(data.role,item.role,"role must remain unchanged");
    assert.equal(data.name,"บัญชีจำลองเท่านั้น");
    assert.equal(data.status,"active");
    assert.equal(Object.hasOwn(data,"password"),false,
      "plaintext field must disappear in the same transaction");
    assert.match(data.credentialVersion,/^[0-9a-f]{48}$/);
    assert.notEqual(appSessionFingerprint(data),oldStamp,
      "legacy cookie must be invalidated once during migration");

    const vault=await db.collection(VAULT_COLLECTION).doc(item.uid).get();
    assert.equal(vault.exists,true);
    assert.equal(vault.data().version,1);
    assert.equal(vault.data().credentialVersion,data.credentialVersion);
    assert.equal(Object.hasOwn(vault.data(),"password"),false);
    assert.ok(vault.data().passwordHash.startsWith("bhs-scrypt-v1$"));
    const expectedPassword=item.password||"123456"; // legacy empty = default
    assert.equal(await verifyPrivateSchoolPassword({
      db,projectId:PROJECT,user:{id:item.uid,...data},
      password:expectedPassword,env
    }),true,"existing username/password must still authenticate");
    assert.equal(await verifyPrivateSchoolPassword({
      db,projectId:PROJECT,user:{id:item.uid,...data},
      password:"wrong fake password",env
    }),false);
    assert.equal(await verifyPrivateSchoolPassword({
      db,projectId:PROJECT,user:{id:item.uid,...data},
      password:expectedPassword,env:{...env,FIRESTORE_EMULATOR_HOST:""}
    }).then(()=>true,()=>false),false,"no remote-Firebase fallback");

    // Existing seven-day cookie semantics still work after a new login.
    const session=makeAppSession(item.uid,appSessionFingerprint(data));
    const current=readAppSession({headers:{cookie:"bhs_app_session="+session}});
    assert.equal(current.userId,item.uid);
    assert.equal(current.credentialTag,appSessionFingerprint(data));
    assert.notEqual(current.credentialTag,oldStamp);

    await assert.rejects(migrateSyntheticUserCredential({
      db,profileRef:ref,uid:item.uid,projectId:PROJECT,env
    }),/account_already_migrated/);
  }
  // End-to-end actual BHS POST /api/app-session against the local
  // Firestore Emulator: same usernames and unchanged passwords.
  const {privateKey}=generateKeyPairSync("rsa",{
    modulusLength:2048,
    publicKeyEncoding:{type:"spki",format:"pem"},
    privateKeyEncoding:{type:"pkcs8",format:"pem"}
  });
  process.env.BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON=JSON.stringify({
    project_id:PROJECT,client_email:"fake-ci-only@"+PROJECT+".iam.gserviceaccount.com",
    private_key:privateKey
  });
  function response(){
    return {headers:{},statusCode:200,body:null,
      setHeader(key,value){this.headers[key]=value;return this;},
      status(status){this.statusCode=status;return this;},
      json(payload){this.body=payload;return this;}
    };
  }
  for(const item of cases){
    const expected=item.password||"123456";
    const latest=(await db.doc(root+"/"+item.uid).get()).data();
    assert.equal(matchesLegacyPassword(expected,latest),false,
      "once migrated, no insecure plaintext/default fallback");
    const req={method:"POST",headers:{host:"localhost"},
      body:{username:item.username.toUpperCase(),password:expected,remember:true}
    };
    let res=response();
    await appSessionHandler(req,res);
    assert.equal(res.statusCode,200,"server login should preserve old credentials");
    assert.equal(res.body.userId,item.uid);
    assert.match(res.headers["Set-Cookie"],/HttpOnly; Secure; SameSite=Strict; Max-Age=604800/);
    const cookie=res.headers["Set-Cookie"].split(";")[0];
    res=response();
    await appSessionHandler({method:"GET",headers:{host:"localhost",cookie}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.userId,item.uid);
    res=response();
    await appSessionHandler({method:"POST",headers:{host:"localhost"},
      body:{username:item.username,password:"WRONG",remember:false}},res);
    assert.equal(res.statusCode,401,"wrong passwords must never authenticate");
  }

  // Check that a caller cannot try to migrate an unrelated/non-test profile.
  await assert.rejects(migrateSyntheticUserCredential({
    db,profileRef:db.doc(root+"/TEST_USER_TEACHER_001"),
    uid:"U01",projectId:PROJECT,env
  }),/synthetic_profile_path_required/);

  // Firestore Rules are deny-by-default for browser clients, even an admin
  // cannot read the private password hash without trusted Admin SDK.
  client=initializeClient({
    projectId:PROJECT,apiKey:"FAKE_TEST_KEY_NO_REAL_NETWORK",
    appId:"1:123456:web:credential-vault-test"
  },"isolated-vault-web-sdk");
  const clientDb=getClientFirestore(client);
  connectFirestoreEmulator(clientDb,"127.0.0.1",8099);
  await assert.rejects(
    getDoc(doc(clientDb,VAULT_COLLECTION,cases[0].uid)),
    err=>err?.code==="permission-denied"
  );

  console.log("PASS: "+migrated+" synthetic BHS usernames and original passwords"+
    " preserved (including short, default, Thai); hashes private, old fields removed"+
    ", 7-day sessions valid, client vault reads denied");
}finally{
  if(client)await deleteClient(client);
  await deleteAdmin(app);
  for(const [key,value] of Object.entries(old)){
    if(value===undefined)delete process.env[key];
    else process.env[key]=value;
  }
}
