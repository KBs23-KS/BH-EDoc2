/**
 * SYNTHETIC Firebase Auth + Firestore seed using Cloud Shell's Google ADC.
 * No service account key downloaded or checked into code.
 * Strictly separate from production and ONLY creates test-prefixed records.
 * First run only: refusing existing accounts instead of overwriting anything.
 */
import {randomBytes} from "node:crypto";
import {initializeApp,applicationDefault,deleteApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore,Timestamp} from "firebase-admin/firestore";
import {SYNTHETIC_USERS,syntheticEmail} from "../security-test/syntheticUsers.js";

const TEST_PROJECT="bhs-edoc-security-test";
export function seedTargetApproved(env=process.env){
  return env.VERCEL!=="1" && env.VERCEL_ENV!=="production" &&
    env.GOOGLE_CLOUD_PROJECT===TEST_PROJECT &&
    (!env.GCLOUD_PROJECT||env.GCLOUD_PROJECT===TEST_PROJECT) &&
    env.BHS_SECURITY_TEST_SEED_CONFIRM===TEST_PROJECT;
}
if(process.argv[1]&&process.argv[1].replace(/\\/g,"/").endsWith("/seed-test-auth-adc.mjs")){
  if(!seedTargetApproved())throw new Error("Blocked: Cloud Shell target must be bhs-edoc-security-test; never use production");
  const app=initializeApp({credential:applicationDefault(),projectId:TEST_PROJECT},"bhs-synthetic-auth-seed");
  const auth=getAuth(app),db=getFirestore(app);
  try{
    // Preflight catches existing/partially seeded data before ANY new writes.
    for(const user of SYNTHETIC_USERS){
      try{
        await auth.getUser(user.uid);
        throw new Error("Account already exists: "+user.uid+"; refusing to overwrite or rotate");
      }catch(error){
        if(error.code!=="auth/user-not-found")throw error;
      }
      const profile=await db.collection("bhs_security_test_profiles").doc(user.uid).get();
      if(profile.exists)throw new Error("Profile already exists: "+user.uid+"; refusing to overwrite");
    }
    for(const id of ["TEST_SHARED_001","TEST_PRIVATE_001","TEST_DIRECTOR_PENDING"]){
      const doc=await db.collection("bhs_security_test_documents").doc(id).get();
      if(doc.exists)throw new Error("Demo document already exists: "+id+"; refusing to overwrite");
    }
    const demoCredentials=SYNTHETIC_USERS.map(user=>({
      ...user,email:syntheticEmail(user.username),password:randomBytes(24).toString("base64url")
    }));
    const batch=db.batch();
    for(const user of demoCredentials){
      batch.create(db.collection("bhs_security_test_profiles").doc(user.uid),{
        name:user.name,role:user.role,status:"active",group:user.username.includes("head")?"synthetic-head":"synthetic"
      });
    }
    const all=demoCredentials.map(user=>user.uid);
    const documents=[
      {id:"TEST_SHARED_001",title:"หนังสือจำลองที่ครูทุกคนอ่านได้",status:"approved",readerUids:all},
      {id:"TEST_PRIVATE_001",title:"หนังสือจำลองจำกัดสิทธิ์",status:"approved",readerUids:["TEST_ADMIN_001","TEST_CLERK_001"]},
      {id:"TEST_DIRECTOR_PENDING",title:"หนังสือจำลองรออนุมัติ",status:"pending-director",readerUids:["TEST_ADMIN_001","TEST_DIRECTOR_001","TEST_DEPUTY_001"]}
    ];
    for(const item of documents)batch.create(db.collection("bhs_security_test_documents").doc(item.id),{
      title:item.title,status:item.status,readerUids:item.readerUids,
      createdBy:"TEST_CLERK_001",createdAt:Timestamp.now()
    });
    // Create Firebase Auth identities + custom claims before making test data visible.
    for(const user of demoCredentials){
      await auth.createUser({uid:user.uid,email:user.email,password:user.password,displayName:user.name,emailVerified:true});
      await auth.setCustomUserClaims(user.uid,{bhsSecurityTest:true});
    }
    await batch.commit();
    process.stdout.write("TEST DATA CREATED ONLY IN "+TEST_PROJECT+"\n");
    process.stdout.write("Keep passwords private; never paste this output into chat or GitHub.\n");
    for(const user of demoCredentials)process.stdout.write(user.username+" : "+user.password+"\n");
    process.stdout.write("For browser login, select one of the usernames shown above.\n");
  }finally{await deleteApp(app);}
}
