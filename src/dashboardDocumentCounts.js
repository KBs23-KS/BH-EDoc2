/** Count accessible documents by register type. No unread/ack status filter. 
 * Input must already be restricted by canReadDoc/canViewRouted for current user.
 */
export function countDocumentTypes(accessibleDocuments=[]) {
  const totals={incoming:0,circulars:0,orders:0};
  for(const doc of accessibleDocuments) {
    if(!doc||doc.isDeleted)continue;
    if(doc.type==="หนังสือเข้า")totals.incoming++;
    else if(doc.type==="หนังสือเวียนแจ้งรับทราบ")totals.circulars++;
    else if(doc.type==="คำสั่งโรงเรียน")totals.orders++;
  }
  return totals;
}
