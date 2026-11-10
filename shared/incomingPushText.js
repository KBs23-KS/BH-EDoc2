/**
 * Number-aware but privacy-safe Thai Web Push copy. No letter subjects or
 * sender identities are ever sent to the phone lock screen.
 */
export function incomingCountText(count){
  if(!Number.isSafeInteger(count)||count<0||count>999999)return null;
  return count===0?"รับทราบหนังสือเข้าครบแล้ว":
    "คุณมีหนังสือเข้ารอรับทราบ "+count+" เรื่อง";
}

// The server, not the browser, supplies the document type and authenticated role.
export function incomingPublicationNotice(kind,docType,user,count){
  if(kind!=="published"||docType!=="หนังสือเข้า"||
     !["teacher","clerk"].includes(user?.role)||
     user?.status==="inactive")return null;
  const body=incomingCountText(count);
  return body?{body,tag:"bhs-unread-incoming",kind:"incoming-count"}:null;
}
