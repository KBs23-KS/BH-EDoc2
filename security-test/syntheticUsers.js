/**
 * Synthetic identities only. Never add real people or school credentials.
 * Domain is reserved for documentation; emails never receive real messages.
 */
export const SYNTHETIC_USERS=Object.freeze([
  {uid:"TEST_ADMIN_001",username:"test_admin",role:"admin",name:"แอดมินจำลอง"},
  {uid:"TEST_DIRECTOR_001",username:"test_director",role:"director",name:"ผู้อำนวยการจำลอง"},
  {uid:"TEST_DEPUTY_001",username:"test_deputy",role:"deputy",name:"รองผู้อำนวยการจำลอง"},
  {uid:"TEST_CLERK_001",username:"test_clerk",role:"clerk",name:"ธุรการจำลอง"},
  {uid:"TEST_HEAD_ADMIN_001",username:"test_head_admin",role:"teacher",name:"หัวหน้ากลุ่มงานจำลอง"},
  {uid:"TEST_HEAD_SUBJECT_001",username:"test_head_subject",role:"teacher",name:"หัวหน้ากลุ่มสาระจำลอง"},
  {uid:"TEST_TEACHER_001",username:"test_teacher",role:"teacher",name:"ครูจำลอง"}
].map(Object.freeze));

const EMAIL_DOMAIN="sandbox.bhs-edoc-security-test.example";
export function syntheticUser(username){
  if(typeof username!=="string")return null;
  const key=username.trim().toLowerCase();
  return SYNTHETIC_USERS.find(user=>user.username===key)||null;
}
export function syntheticEmail(username){
  const user=syntheticUser(username);
  return user?user.username+"@"+EMAIL_DOMAIN:null;
}
