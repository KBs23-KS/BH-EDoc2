import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {headGroups,pendingHeadGroups,completedHeadGroups,isRoutingEligibleDoc} from "../src/routing.js";

// A head can have two distinct responsibilities for the same book.
// Each responsibility must migrate independently when that head finishes it.
const head={id:"H",role:"teacher",status:"active",adminDept:"บริหารวิชาการ",subjectArea:"วิทยาศาสตร์"};
const outsider={id:"O",role:"teacher",status:"active",subjectArea:"ภาษาไทย"};
const settings={
  adminHeads:{"บริหารวิชาการ":{primary:"H"}},
  subjectHeads:{"วิทยาศาสตร์":{primary:"H"}},
  adminDepts:["บริหารวิชาการ"],subjectAreas:["วิทยาศาสตร์"]
};
const book={
  id:"DOC-100",type:"หนังสือเข้า",status:"อนุมัติ/สั่งการแล้ว",isDeleted:false,
  routingEntries:[{id:"director-1",groups:["บริหารวิชาการ","วิทยาศาสตร์"],userIds:[]}],
  headActions:[]
};
const groupNames=items=>items.map(x=>x.group).sort();
assert.deepEqual(groupNames(headGroups(head,settings)),["บริหารวิชาการ","วิทยาศาสตร์"].sort());
assert.deepEqual(groupNames(pendingHeadGroups(book,head,settings)),["บริหารวิชาการ","วิทยาศาสตร์"].sort());
assert.deepEqual(completedHeadGroups(book,head,settings),[]);
assert.deepEqual(pendingHeadGroups(book,outsider,settings),[]);

const oneDone={...book,headActions:[{id:"head-1",group:"บริหารวิชาการ",userIds:["teacher1"],message:"ดำเนินการ",at:1700000000000}]};
assert.deepEqual(groupNames(pendingHeadGroups(oneDone,head,settings)),["วิทยาศาสตร์"]);
assert.deepEqual(groupNames(completedHeadGroups(oneDone,head,settings)),["บริหารวิชาการ"]);

const bothDone={...oneDone,headActions:[...oneDone.headActions,
  {id:"head-2",group:"วิทยาศาสตร์",userIds:[],message:"รับทราบ",at:1700000000001}]};
assert.deepEqual(pendingHeadGroups(bothDone,head,settings),[]);
assert.deepEqual(groupNames(completedHeadGroups(bothDone,head,settings)),["บริหารวิชาการ","วิทยาศาสตร์"].sort());

// A head-only acknowledgement counts as finished, and should remain available for later editing.
const acknowledgedOnly={...book,headActions:[{id:"head-3",group:"บริหารวิชาการ",userIds:[],message:"รับทราบ"}]};
assert.deepEqual(groupNames(completedHeadGroups(acknowledgedOnly,head,settings)),["บริหารวิชาการ"]);

// Reassignment history must not move an item back into pending.
const reassign={...oneDone,headActions:[...oneDone.headActions,
  {id:"head-4",group:"บริหารวิชาการ",userIds:["teacher2"],supersedes:"head-1",message:"มอบหมายใหม่"}]};
assert.deepEqual(groupNames(pendingHeadGroups(reassign,head,settings)),["วิทยาศาสตร์"]);
assert.deepEqual(groupNames(completedHeadGroups(reassign,head,settings)),["บริหารวิชาการ"]);

// Non-final and deleted documents must not be displayed in either head tab.
for(const invalid of [{...book,status:"รอผู้อำนวยการ"},{...book,isDeleted:true}]){
  assert.equal(isRoutingEligibleDoc(invalid),false);
  assert.deepEqual(pendingHeadGroups(invalid,head,settings),[]);
  assert.deepEqual(completedHeadGroups(invalid,head,settings),[]);
}
const workspace=readFileSync(new URL("../src/RoutingWorkspace.jsx",import.meta.url),"utf8");
const actions=readFileSync(new URL("../src/routingActions.js",import.meta.url),"utf8");
assert.ok(workspace.includes('switchHeadTab("completed")'),"completed tab is clickable");
assert.ok(workspace.includes('switchHeadTab("pending")'),"pending tab is clickable");
assert.ok(workspace.includes("activeHeadRows=headTab"),"selected tab controls the displayed head rows");
assert.ok(workspace.includes("completed?.userIds||[]"),"editing starts with latest assigned users");
assert.ok(actions.includes('if(reassign&&!old)'),"previous acknowledgement may be edited to add recipients");
console.log("Head-routing pending/completed tabs and reassignment regression passed");
