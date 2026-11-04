/**
 * Pure BHS workflow decision policy used by the isolated server API.
 * A signed PDF may NEVER be inferred from a client-supplied filename.
 */
export const WAITING_DEPUTY="รอรองผู้อำนวยการ";
export const WAITING_DIRECTOR="รอผู้อำนวยการ";
export const RETURNED="ส่งกลับแก้ไข";
export const COMPLETED="อนุมัติ/สั่งการแล้ว";
export function authorizeDocumentReview(user,record,action){
  if(!user||user.status==="inactive"||!record||record.isDeleted||
     !["APPROVE","RETURN"].includes(action))return false;
  const deputy=record.status===WAITING_DEPUTY;
  const director=record.status===WAITING_DIRECTOR;
  if(!deputy&&!director)return false;
  return deputy?["deputy","admin"].includes(user.role):
    ["director","admin"].includes(user.role);
}
export function mayApproveWithoutPdf(record){
  return record?.type==="หนังสือเข้า"&&record?.status===WAITING_DIRECTOR;
}
export function allowedReviewRecipients({groups=[],userIds=[],all=false},users,settings){
  if(!Array.isArray(groups)||!Array.isArray(userIds)||groups.length>30||
     userIds.length>500||new Set(groups).size!==groups.length||
     new Set(userIds).size!==userIds.length||typeof all!=="boolean")return false;
  const groupNames=new Set([...(settings?.adminDepts||[]),...(settings?.subjectAreas||[])]);
  const usersById=new Map(users.filter(u=>u.status!=="inactive"&&
    ["teacher","clerk"].includes(u.role)).map(u=>[u.id,u]));
  if(groups.some(g=>typeof g!=="string"||!groupNames.has(g))||
     userIds.some(id=>!usersById.has(id)))return false;
  return all||groups.length>0||userIds.length>0;
}
