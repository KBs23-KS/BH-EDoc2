/**
 * BHS school administrator operations — ISOLATED local Emulator ONLY.
 * No live Firestore, no Drive, no signed PDF changes.
 */
import {randomUUID} from "node:crypto";
import {assertCredentialVaultBoundary} from "./_schoolCredentialVault.js";
import {
  occupiedRegisterNumbers,parseRegisterNumber,nextAvailableNumber
} from "../src/orderNumberPolicy.js";

const ROOT="artifacts/bhs-edoc-app/public/data/";
const TEST_UID=/^TEST_[A-Za-z0-9_-]{1,120}$/;
const KIND={ORDER:{collection:"bhs_order_reservations"},OUT:{collection:"bhs_outgoing_reservations"}};
const SETTINGS_FIELDS=[
  "schoolName","schoolLogoText","academicYear","fiscalYear",
  "adminDepts","subjectAreas","adminHeads","subjectHeads"
];
const issue=(status,code)=>Object.assign(new Error(code),{status,code});
const validYear=year=>Number.isInteger(year)&&year>=2500&&year<=2999;
const validNext=n=>Number.isSafeInteger(n)&&n>=1&&n<=999999999;
function checkAdmin(user){
  if(!user||user.role!=="admin"||user.status!=="active")
    throw issue(403,"active_admin_required");
}
function validateType(kind,year){
  if(!KIND[kind]||!validYear(year))throw issue(400,"invalid_register");
}
function toRows(snap){return snap.docs.map(x=>({id:x.id,...x.data()}));}
function highestNumber(kind,year,rows,docs){
  const occupied=occupiedRegisterNumbers(kind,rows,docs);
  let highest=0;
  for(const text of occupied){
    const p=parseRegisterNumber(text);
    if(p?.year===year)highest=Math.max(highest,p.sequence);
  }
  return {occupied,highest};
}
function accountRef(db,actorId){
  if(!TEST_UID.test(actorId||""))throw issue(400,"synthetic_user_only");
  return db.doc(ROOT+"bhs_users/"+actorId);
}
function bound(db,projectId,env){assertCredentialVaultBoundary({projectId,env});}
export async function readSyntheticRegisterOverview({
  db,projectId,actorId,kind,year,env=process.env
}){
  bound(db,projectId,env);validateType(kind,year);
  const [actor,counter,rows,docs,logs]=await Promise.all([
    accountRef(db,actorId).get(),
    db.doc(ROOT+"bhs_number_counters/"+kind+"-"+year).get(),
    db.collection(ROOT+KIND[kind].collection).get(),
    db.collection(ROOT+"bhs_documents").get(),
    db.collection(ROOT+"bhs_audit_logs").orderBy("timestamp","desc").limit(300).get()
  ]);
  checkAdmin(actor.exists?actor.data():null);
  const {highest}=highestNumber(kind,year,toRows(rows),toRows(docs));
  const history=logs.docs.filter(x=>{
    const d=x.data();
    return d.targetType==="NUMBER_COUNTER"&&d.targetId===kind+"-"+year;
  }).slice(0,100).map(x=>{
    const d=x.data();
    return {timestamp:Number(d.timestamp)||0,
      userName:typeof d.userName==="string"?d.userName.slice(0,180):"",
      action:typeof d.action==="string"?d.action.slice(0,150):"",
      detail:typeof d.detail==="string"?d.detail.slice(0,400):""};
  });
  return {
    success:true,kind,year,highest,
    counter:counter.exists?{
      kind,year,lastNumber:Number(counter.data().lastNumber)||0,
      revision:Number(counter.data().revision)||0
    }:null,
    history
  };
}
export async function setSyntheticNextRegister({
  db,projectId,actorId,kind,year,nextNumber,env=process.env
}){
  bound(db,projectId,env);validateType(kind,year);
  if(!validNext(nextNumber))throw issue(400,"invalid_next_number");
  return db.runTransaction(async tx=>{
    const c=db.doc(ROOT+"bhs_number_counters/"+kind+"-"+year);
    const [actor,counter,rows,docs]=await Promise.all([
      tx.get(accountRef(db,actorId)),tx.get(c),
      tx.get(db.collection(ROOT+KIND[kind].collection)),
      tx.get(db.collection(ROOT+"bhs_documents"))
    ]);
    checkAdmin(actor.exists?actor.data():null);
    const {highest,occupied}=highestNumber(kind,year,toRows(rows),toRows(docs));
    const next=nextAvailableNumber(nextNumber,year,occupied);
    const timestamp=Date.now();
    const revision=Number(counter.data()?.revision||0)+1;
    tx.set(c,{kind,year,lastNumber:nextNumber-1,revision,
      manualSetBy:actorId,manualSetAt:timestamp,updatedAt:timestamp},{merge:true});
    tx.create(db.collection(ROOT+"bhs_audit_logs").doc("TEST_AUDIT_"+randomUUID()),{
      action:"แอดมินกำหนดเลขถัดไป",targetType:"NUMBER_COUNTER",
      targetId:kind+"-"+year,userId:actorId,
      userName:actor.data().name||"บัญชีทดสอบ",timestamp,
      detail:"ตั้งเลขถัดไป "+nextNumber+"/"+year+
        " (เลขใช้งานที่ระบบจะข้าม: "+(next.sequence-nextNumber)+")"
    });
    return {success:true,kind,year,highest,effectiveNext:next.text,
      counter:{kind,year,lastNumber:nextNumber-1,revision}};
  });
}
const safeText=(value,max)=>typeof value==="string"&&
  value.trim().length>0&&value.trim().length<=max;
function validateGroups(value){
  return Array.isArray(value)&&value.length<=50&&
    value.every(x=>safeText(x,120))&&new Set(value).size===value.length;
}
function validateHeads(heads,groups){
  return Boolean(heads)&&typeof heads==="object"&&!Array.isArray(heads)&&
    Object.keys(heads).length<=50&&Object.entries(heads).every(([group,entry])=>
      groups.includes(group)&&(typeof entry==="string"?
        entry.length<=128:
        entry&&typeof entry==="object"&&!Array.isArray(entry)&&
        Object.keys(entry).every(k=>["primary","acting"].includes(k))&&
        ["primary","acting"].every(k=>entry[k]===undefined||entry[k]===null||
          (typeof entry[k]==="string"&&entry[k].length<=128))
      )
    );
}
export function validateSchoolSettings(value){
  if(!value||typeof value!=="object"||Array.isArray(value)||
     Object.keys(value).some(k=>!SETTINGS_FIELDS.includes(k))||
     !safeText(value.schoolName,200)||!safeText(value.schoolLogoText,40)||
     !/^\d{4}$/.test(value.academicYear||"")||
     !/^\d{4}$/.test(value.fiscalYear||"")||
     !validateGroups(value.adminDepts)||!validateGroups(value.subjectAreas)||
     !validateHeads(value.adminHeads,value.adminDepts)||
     !validateHeads(value.subjectHeads,value.subjectAreas))
    throw issue(400,"invalid_settings_fields");
  return Object.fromEntries(SETTINGS_FIELDS.map(k=>[k,value[k]]));
}
export async function saveSyntheticSchoolSettings({
  db,projectId,actorId,settings,env=process.env
}){
  bound(db,projectId,env);
  const fields=validateSchoolSettings(settings);
  return db.runTransaction(async tx=>{
    const ref=db.doc(ROOT+"bhs_settings/system");
    const [account,current]=await Promise.all([
      tx.get(accountRef(db,actorId)),tx.get(ref)
    ]);
    checkAdmin(account.exists?account.data():null);
    const now=Date.now();
    tx.set(ref,{...fields,updatedAt:now,updatedBy:actorId},{merge:true});
    tx.create(db.collection(ROOT+"bhs_audit_logs").doc("TEST_AUDIT_"+randomUUID()),{
      action:"แก้ไขการตั้งค่าระบบ",targetType:"SYSTEM",targetId:"settings",
      userId:actorId,userName:account.data().name||"บัญชีทดสอบ",
      timestamp:now,detail:"อัปเดตโครงสร้างโรงเรียนจำลองผ่านเซิร์ฟเวอร์"
    });
    return {success:true,updatedAt:now,priorExists:current.exists};
  });
}
