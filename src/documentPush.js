/** Best-effort server-side push after a successful school-document write.
 * This endpoint independently validates the authenticated actor and document transition.
 * Push outages must never block saving a document or an audit record.
 */
export function dispatchDocumentPush(docId,event){
  if(!docId||!event||!navigator.onLine)return;
  fetch("/api/push-dispatch",{
    method:"POST",credentials:"same-origin",keepalive:true,
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({docId,event})
  }).catch(err=>console.warn("Background school notice pending",err?.message));
}
