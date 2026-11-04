/**
 * ISOLATED-EMULATOR ONLY school account administration.
 * The real BHS credential workflow can use this shape after a separately
 * audited production migration; it is NOT a deployable production API.
 *
 * Server-verified admin -> current DB admin -> transactionally consistent
 * profile, private salted credential hash, username lock and audit record.
 * NEVER returns password, hash or credentialVersion.
 */
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {FieldValue} from "firebase-admin/firestore";
import {hashSchoolPassword,validExistingPassword} from "./_passwordSecurity.js";
import {
  assertCredentialVaultBoundary,vaultDocument,VAULT_VERSION
} from "./_schoolCredentialVault.js";
import {normalizeUsername} from "../shared/username.js";

const ROOT="artifacts/bhs-edoc-app/public/data/";
const ROLES=new Set(["admin","director","deputy","clerk","teacher"]);
const STATES=new Set(["active","inactive"]);
const TEST_UID=/^TEST_[A-Za-z0-9_-]{1,120}$/;
const problem=(status,code)=>Object.assign(new Error(code),{status,code});
const str=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=max;
const usernameIndex=normalized=>
  "sha256-"+createHash("sha256").update(normalized,"utf8").digest("hex");
function normalizedProfile(form){
  if(!form||typeof form!=="object"||Array.isArray(form)||
     !str(form.name,180)||!str(form.username,120)||
     !ROLES.has(form.role)||!STATES.has(form.status)||
     !str(form.adminDept,120)||!str(form.subjectArea,120))
    throw problem(400,"invalid_account_fields");
  const username=form.username.trim();
  const key=normalizeUsername(username);
  if(!/^[^\s/\\]{1,120}$/.test(username)||!key)
    throw problem(400,"invalid_username");
  return {
    username,name:form.name.trim(),role:form.role,status:form.status,
    adminDept:["director","deputy"].includes(form.role)?"-":form.adminDept.trim(),
    subjectArea:["director","deputy"].includes(form.role)?"-":form.subjectArea.trim()
  };
}
export async function manageSyntheticSchoolAccount({
  db,projectId,actorId,action,targetId,form={},env=process.env
}){
  assertCredentialVaultBoundary({projectId,env});
  if(!TEST_UID.test(actorId||"")||
     !["create","edit","status","delete"].includes(action)||
     (action!=="create"&&!TEST_UID.test(targetId||"")))
    throw problem(400,"invalid_test_account_request");

  const profiles=db.collection(ROOT+"bhs_users");
  const index=db.collection("bhs_private_usernames");
  const audits=db.collection(ROOT+"bhs_audit_logs");
  const generatedId=action==="create"?
    "TEST_USER_"+randomBytes(12).toString("hex").toUpperCase():targetId;
  const chosenForm=["create","edit"].includes(action)?normalizedProfile(form):null;
  if(action==="create"&&(!validExistingPassword(form.password)))
    throw problem(400,"new_password_required");
  if(action==="edit"&&form.password!==undefined&&form.password!==""
    &&!validExistingPassword(form.password))
    throw problem(400,"invalid_password");
  if(action==="status"&&!STATES.has(form?.status))
    throw problem(400,"invalid_status");

  const wantsPassword=action==="create"||
    (action==="edit"&&typeof form.password==="string"&&form.password!=="");
  // Expensive scrypt executes only outside transaction retries.
  const newHash=wantsPassword?await hashSchoolPassword(form.password):null;
  const newCredentialVersion=wantsPassword?randomBytes(24).toString("hex"):null;

  const result=await db.runTransaction(async tx=>{
    // READ FIRST, then plan all writes. The serializing lock also protects
    // against concurrent uppercase/lowercase username collisions.
    const lockRef=db.doc(ROOT+"bhs_security_locks/usernames");
    const actorRef=profiles.doc(actorId);
    const targetRef=profiles.doc(generatedId);
    const docs=await Promise.all([
      tx.get(lockRef),tx.get(actorRef),
      tx.get(targetRef),tx.get(profiles)
    ]);
    const [lockSnap,actorSnap,targetSnap,usersSnap]=docs;
    const actor=actorSnap.exists?actorSnap.data():null;
    if(!actor||actor.status!=="active"||actor.role!=="admin")
      throw problem(403,"admin_required");
    const previous=targetSnap.exists?targetSnap.data():null;
    if(action==="create"&&previous)throw problem(409,"account_conflict");
    if(action!=="create"&&!previous)throw problem(404,"account_missing");
    if(action==="delete"&&actorId===targetId)
      throw problem(403,"self_delete_denied");
    const existing=usersSnap.docs.map(x=>({id:x.id,...x.data()}));
    let planned=chosenForm||previous;
    if(action==="status")planned={...previous,status:form.status};
    if(action==="delete")planned=null;
    if(action!=="delete"&&!planned)throw problem(400,"invalid_profile");
    if(action!=="delete"&&existing.some(x=>
      x.id!==generatedId&&normalizeUsername(x.username)===normalizeUsername(planned.username)))
      throw problem(409,"duplicate_username");
    if(action==="edit"||action==="status"){
      if(!previous.credentialVersion||previous.credentialVersion.length<24)
        throw problem(409,"account_not_migrated");
      if(action==="edit"&&previous.username!==chosenForm.username&&
         actorId===targetId)throw problem(403,"admin_self_rename_denied");
      if(actorId===targetId&&
         (planned.role!=="admin"||planned.status!=="active"))
        throw problem(403,"self_demote_denied");
    }
    if(action==="delete"&&previous.role==="admin"&&
       existing.filter(x=>x.role==="admin"&&x.status==="active").length<=1)
      throw problem(403,"last_admin_denied");
    const priorKey=previous?normalizeUsername(previous.username):null;
    const nextKey=planned?normalizeUsername(planned.username):null;
    const oldIndexRef=priorKey?index.doc(usernameIndex(priorKey)):null;
    const newIndexRef=nextKey?index.doc(usernameIndex(nextKey)):null;
    const credentialRef=vaultDocument(db,generatedId);
    const credentialSnap=await tx.get(credentialRef);
    const oldIndex=oldIndexRef?await tx.get(oldIndexRef):null;
    const newIndex=newIndexRef?await tx.get(newIndexRef):null;
    if(action!=="create"&&(!credentialSnap.exists||
       credentialSnap.data()?.credentialVersion!==previous.credentialVersion))
      throw problem(409,"credential_migration_required");
    if(action==="create"&&credentialSnap.exists)
      throw problem(409,"credential_conflict");
    if(newIndex?.exists&&newIndex.data().uid!==generatedId)
      throw problem(409,"username_index_conflict");
    if(oldIndex?.exists&&oldIndex.data().uid!==generatedId)
      throw problem(409,"username_index_conflict");

    const now=Date.now(),oldVersion=Number(lockSnap.data()?.version||0);
    tx.set(lockRef,{version:oldVersion+1,updatedAt:now});
    const event=action==="create"?"เพิ่มบัญชีทดสอบ":
      action==="edit"?"แก้ไขบัญชีทดสอบ":
      action==="status"?"เปลี่ยนสถานะบัญชีทดสอบ":"ลบบัญชีทดสอบ";
    if(action==="create"){
      tx.create(targetRef,{...chosenForm,credentialVersion:newCredentialVersion});
      tx.create(credentialRef,{version:VAULT_VERSION,passwordHash:newHash,
        credentialVersion:newCredentialVersion,disabled:chosenForm.status==="inactive"});
      tx.set(newIndexRef,{uid:generatedId});
    }else if(action==="delete"){
      tx.delete(targetRef);
      tx.delete(credentialRef);
      if(oldIndex?.exists)tx.delete(oldIndexRef);
    }else{
      const changes=action==="edit"?{
        ...chosenForm,
        ...(wantsPassword?{credentialVersion:newCredentialVersion}:{})
      }:{status:form.status};
      tx.update(targetRef,changes);
      const vaultChanges={
        disabled:action==="status"?form.status==="inactive":
          chosenForm.status==="inactive"
      };
      if(wantsPassword){
        vaultChanges.passwordHash=newHash;
        vaultChanges.credentialVersion=newCredentialVersion;
        vaultChanges.version=VAULT_VERSION;
      }
      tx.update(credentialRef,vaultChanges);
      if(priorKey!==nextKey&&oldIndex?.exists)tx.delete(oldIndexRef);
      tx.set(newIndexRef,{uid:generatedId});
    }
    tx.create(audits.doc("TEST_AUDIT_"+randomUUID()),{
      action:event,userId:actorId,targetId:generatedId,targetType:"USER",
      timestamp:now,detail:"บัญชีจำลอง; ไม่มีรหัสผ่านหรือแฮชใน Audit Log"
    });
    return {success:true,action,userId:generatedId};
  });
  return result;
}
