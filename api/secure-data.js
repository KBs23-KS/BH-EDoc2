/**
 * PREVIEW ONLY — user-specific BHS document feed from the server.
 * No response contains a school password, a hash, or a full unrestricted
 * document list. The legacy school UI is not switched until cutover tested.
 */
import {fail,forbidCrossSite,setupResponse} from "./_signatureServer.js";
import {secureApiPreviewReady,requirePreviewSchoolSession,secureApiResponse}
  from "./_schoolSessionGuard.js";
import {safeSchoolSettings,filterSchoolDocuments,filterSchoolReservations,
  filterSchoolReminders} from "../shared/secureDocumentFeed.js";
const ROOT="artifacts/bhs-edoc-app/public/data/";
const LISTS=[
  "bhs_documents","bhs_order_reservations",
  "bhs_outgoing_reservations","bhs_reminders"
];
export default async function handler(req,res){
  setupResponse(res);
  if(forbidCrossSite(req,res))return;
  if(req.method!=="GET")return fail(res,405,"ไม่รองรับวิธีเรียกนี้");
  if(!secureApiPreviewReady("BHS_ENABLE_SECURE_DATA_PREVIEW"))
    return secureApiResponse(res,503);
  try{
    const {user,db}=await requirePreviewSchoolSession(req);
    const [directory,settingsSnap,...records]=await Promise.all([
      db.collection(ROOT+"bhs_users").get(),
      db.doc(ROOT+"bhs_settings/system").get(),
      ...LISTS.map(name=>db.collection(ROOT+name).get())
    ]);
    const users=directory.docs.map(x=>({id:x.id,...x.data()}));
    const settings=safeSchoolSettings(settingsSnap.exists?settingsSnap.data():{});
    const asRecords=snap=>snap.docs.map(item=>({id:item.id,...item.data()}));
    const [documents,orders,outgoing,reminders]=records.map(asRecords);
    const permitted=filterSchoolDocuments(user,documents,users,settings);
    return res.status(200).json({
      success:true,
      userId:user.id,
      documents:permitted,
      orderReservations:filterSchoolReservations(user,orders),
      outgoingReservations:filterSchoolReservations(user,outgoing),
      reminders:filterSchoolReminders(user,reminders),
      settings
    });
  }catch(error){
    if(error?.status===401)return secureApiResponse(res,401);
    console.error("Isolated secure data feed failed",error?.code||"unavailable");
    return secureApiResponse(res,503);
  }
}
