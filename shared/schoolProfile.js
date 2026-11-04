/**
 * Strict allowlist for school-user data sent to the browser after server login.
 * Password fields and private security metadata must never leave the server.
 */
export function browserSchoolProfile(id,record,requesterRole="teacher"){
  if(!record||typeof record!=="object")return null;
  const profile={
    id:String(id||""),
    name:String(record.name||""),
    role:String(record.role||"teacher"),
    adminDept:String(record.adminDept||""),
    subjectArea:String(record.subjectArea||""),
    status:String(record.status||"active")
  };
  if(requesterRole==="admin")profile.username=String(record.username||"");
  return profile;
}
export function browserSchoolDirectory(records,requesterRole){
  if(!Array.isArray(records))return [];
  return records.filter(item=>requesterRole==="admin"||item?.data?.status!=="inactive")
    .map(item=>browserSchoolProfile(item.id,item.data,requesterRole))
    .filter(Boolean);
}
