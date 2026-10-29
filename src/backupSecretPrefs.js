/** Optional backup credential remembered locally by an administrator.
 * CAUTION: browser localStorage is NOT encrypted and can be accessed by scripts
 * running on this origin. Never sync this secret to Firestore or GitHub.
 */
const PREFIX="bhs-edoc:backup-secret:v1:";
export const backupSecretKey=userId=>PREFIX+encodeURIComponent(String(userId));
export function loadSavedBackupSecret(storage,userId){
  try{return storage?.getItem(backupSecretKey(userId))||"";}catch{return "";}
}
export function saveBackupSecret(storage,userId,secret){
  if(!secret||!secret.trim())return false;
  try{storage?.setItem(backupSecretKey(userId),secret.trim());return true;}
  catch{return false;}
}
export function forgetBackupSecret(storage,userId){
  try{storage?.removeItem(backupSecretKey(userId));return true;}
  catch{return false;}
}
