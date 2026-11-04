/**
 * Self-service school password change — local Firestore Emulator ONLY.
 * Existing username remains unchanged. The old password is required even
 * when the user already has a seven-day website login cookie.
 */
import {randomBytes,randomUUID} from "node:crypto";
import {hashSchoolPassword,verifySchoolPassword,validExistingPassword}
  from "./_passwordSecurity.js";
import {assertCredentialVaultBoundary,vaultDocument,VAULT_VERSION}
  from "./_schoolCredentialVault.js";
const ROOT="artifacts/bhs-edoc-app/public/data/";
const TEST_UID=/^TEST_[A-Za-z0-9_-]{1,120}$/;
const problem=(status,code)=>Object.assign(new Error(code),{status,code});
export async function changeSyntheticOwnPassword({
  db,projectId,userId,currentPassword,newPassword,env=process.env
}){
  assertCredentialVaultBoundary({projectId,env});
  if(!TEST_UID.test(userId||"")||
     !validExistingPassword(currentPassword)||
     !validExistingPassword(newPassword))
    throw problem(400,"invalid_password_request");
  if(currentPassword===newPassword)throw problem(400,"same_password");
  const ref=db.doc(ROOT+"bhs_users/"+userId),vaultRef=vaultDocument(db,userId);
  const [profile,vault]=await Promise.all([ref.get(),vaultRef.get()]);
  if(!profile.exists||!vault.exists||profile.data().status!=="active"||
     vault.data()?.disabled===true||
     vault.data()?.credentialVersion!==profile.data()?.credentialVersion)
    throw problem(401,"identity_not_active");
  if(!(await verifySchoolPassword(currentPassword,vault.data().passwordHash)))
    throw problem(401,"incorrect_current_password");
  const newHash=await hashSchoolPassword(newPassword);
  const nextVersion=randomBytes(24).toString("hex");
  await db.runTransaction(async tx=>{
    const [freshUser,freshVault]=await Promise.all([tx.get(ref),tx.get(vaultRef)]);
    if(!freshUser.exists||!freshVault.exists||
       freshUser.data().status!=="active"||
       freshVault.data().disabled===true||
       freshUser.data().credentialVersion!==profile.data().credentialVersion||
       freshVault.data().credentialVersion!==vault.data().credentialVersion)
      throw problem(409,"credential_changed_during_request");
    tx.update(ref,{credentialVersion:nextVersion});
    tx.update(vaultRef,{
      version:VAULT_VERSION,credentialVersion:nextVersion,passwordHash:newHash
    });
    tx.create(db.collection(ROOT+"bhs_audit_logs").doc("TEST_AUDIT_"+randomUUID()),{
      action:"ผู้ใช้เปลี่ยนรหัสผ่าน",userId,targetId:userId,targetType:"AUTH",
      timestamp:Date.now(),detail:"เปลี่ยนแฮชและยกเลิกเซสชันเดิม"
    });
  });
  // Do not return passwords, vault hashes or new secret revisions.
  return {success:true,requiresLogin:true};
}
