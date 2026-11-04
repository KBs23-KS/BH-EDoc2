/**
 * Entirely fictitious identities, numbers, metadata and PDF references.
 * Never fetches BHS production Firebase/Drive or stores real school records.
 * Main BHS fields retained; recipientIds / assignedUserIds / routedGroup are
 * synthetic server-maintained security projections for proposed strict rules.
 */
export const IDS=Object.freeze({
  admin:"TEST_ADMIN_001",director:"TEST_DIRECTOR_001",
  deputy:"TEST_DEPUTY_001",clerk:"TEST_CLERK_001",
  headAdmin:"TEST_HEAD_ADMIN_001",headSubject:"TEST_HEAD_SUBJECT_001",
  teacher:"TEST_TEACHER_001",outsider:"TEST_OUTSIDER_001",
  acting:"TEST_ACTING_HEAD_001",inactive:"TEST_INACTIVE_001"
});
export const ADMIN_GROUP="กลุ่มบริหารวิชาการ";
export const SUBJECT_GROUP="วิทยาศาสตร์และเทคโนโลยี";
export const OTHER_SUBJECT="คณิตศาสตร์";
const base=(id,name,role,adminDept,subjectArea,status="active")=>({
  id,username:"synthetic_"+id.toLowerCase(),name,role,adminDept,subjectArea,status
});
export const USERS=Object.freeze([
  base(IDS.admin,"ผู้ดูแลทดสอบ","admin","-","-"),
  base(IDS.director,"ผู้อำนวยการทดสอบ","director","-","-"),
  base(IDS.deputy,"รองผู้อำนวยการทดสอบ","deputy","-","-"),
  base(IDS.clerk,"ธุรการทดสอบ","clerk","-",OTHER_SUBJECT),
  base(IDS.headAdmin,"หัวหน้ากลุ่มงานทดสอบ","teacher",ADMIN_GROUP,OTHER_SUBJECT),
  base(IDS.headSubject,"หัวหน้าสาระทดสอบ","teacher","-",SUBJECT_GROUP),
  base(IDS.teacher,"ครูทดสอบ","teacher",ADMIN_GROUP,SUBJECT_GROUP),
  base(IDS.outsider,"ครูนอกกลุ่มทดสอบ","teacher","-",OTHER_SUBJECT),
  base(IDS.acting,"รักษาการหัวหน้าทดสอบ","teacher",ADMIN_GROUP,SUBJECT_GROUP),
  base(IDS.inactive,"ครูระงับทดสอบ","teacher",ADMIN_GROUP,SUBJECT_GROUP,"inactive")
]);
export const SETTINGS=Object.freeze({
  schoolName:"โรงเรียนจำลอง (ข้อมูลทดสอบเท่านั้น)",
  adminDepts:[ADMIN_GROUP],
  subjectAreas:[SUBJECT_GROUP,OTHER_SUBJECT],
  adminHeads:{[ADMIN_GROUP]:{primary:IDS.headAdmin,acting:IDS.acting}},
  subjectHeads:{[SUBJECT_GROUP]:{primary:IDS.headSubject,acting:""}}
});
export const DOC_IDS=Object.freeze({
  incoming:"TEST_DOC_INCOMING_AAA",
  order:"TEST_DOC_ORDER_BBB",
  routed:"TEST_DOC_ROUTED_CCC",
  subject:"TEST_DOC_SUBJECT_DDD",
  returned:"TEST_DOC_RETURNED_EEE",
  circular:"TEST_DOC_CIRCULAR_FFF",
  deleted:"TEST_DOC_DELETED_GGG"
});
const NOW=1793764800000;
const sourceFile=(key)=>({
  name:"TEST_FAKE_"+key+".pdf",type:"PDF",driveId:"TEST_FAKE_DRIVE_"+key,
  url:"https://invalid.example/never-request/TEST_FAKE_"+key+".pdf",
  size:1024
});
export const FAKE_PDF=sourceFile("001");
export const REVISED_PDF=sourceFile("002");
export function documentFixture(id,overrides={}){
  const type=overrides.type||"หนังสือเข้า";
  const {type:ignored,...remaining}=overrides;
  return {
    id,docNumber:"TEST-0001/2569",subject:"เอกสารทดสอบระบบเท่านั้น",
    type,date:"2026-11-04",from:"สำนักงานจำลอง",urgency:"ปกติ",
    status:"รอรองผู้อำนวยการ",createdBy:IDS.clerk,createdAt:NOW,lastEventAt:NOW,
    responsibleName:"ธุรการจำลอง",assignedTo:"",
    files:[FAKE_PDF],activeFileVersion:1,
    fileVersions:[{version:1,files:[FAKE_PDF],timestamp:NOW}],
    signedFiles:[],history:[{action:"สร้างเอกสารจำลอง",by:IDS.clerk,timestamp:NOW}],
    recipientsSnapshot:[],recipientIds:[],assignedUserIds:[],routedGroup:"",
    routingEntries:[],headActions:[],assignmentAcknowledged:[],
    acknowledgedBy:[],acknowledgedAt:{},isDeleted:false,
    ...remaining
  };
}
export function startingDocuments(){
  return [
    documentFixture(DOC_IDS.incoming),
    documentFixture(DOC_IDS.order,{
      type:"คำสั่งโรงเรียน",status:"รอผู้อำนวยการ",
      createdBy:IDS.teacher,docNumber:"TEST-ORDER-0001/2569"
    }),
    documentFixture(DOC_IDS.routed,{
      type:"หนังสือเข้า",status:"อนุมัติ/สั่งการแล้ว",
      assignedTo:ADMIN_GROUP,routedGroup:ADMIN_GROUP,
      recipientIds:[IDS.teacher],recipientsSnapshot:[{id:IDS.teacher,name:"ครูทดสอบ"}],
      routingEntries:[{
        id:"TEST_ROUTE_001",kind:"director",by:IDS.director,
        groups:[ADMIN_GROUP],userIds:[IDS.teacher],at:NOW,message:"ทดสอบมอบหมาย"
      }],
      assignedUserIds:[IDS.teacher]
    }),
    documentFixture(DOC_IDS.subject,{
      type:"หนังสือเข้า",status:"เผยแพร่แล้ว",
      assignedTo:SUBJECT_GROUP,routedGroup:SUBJECT_GROUP,
      recipientIds:[IDS.headSubject],recipientsSnapshot:[{id:IDS.headSubject,name:"หัวหน้าสาระทดสอบ"}]
    }),
    documentFixture(DOC_IDS.returned,{
      type:"หนังสือเวียนแจ้งรับทราบ",status:"ส่งกลับแก้ไข",
      createdBy:IDS.teacher,rejectReason:"แก้ไขเอกสาร PDF"
    }),
    documentFixture(DOC_IDS.circular,{
      type:"หนังสือเวียนแจ้งรับทราบ",status:"รอรองผู้อำนวยการ",
      createdBy:IDS.clerk
    }),
    documentFixture(DOC_IDS.deleted,{
      status:"เผยแพร่แล้ว",recipientIds:[IDS.teacher],isDeleted:true
    })
  ];
}
export function identity(role){return USERS.find(u=>u.id===IDS[role]);}
