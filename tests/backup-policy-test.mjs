import assert from "node:assert/strict";
import {isMissingDriveReference,isIncompleteArchive,missingFilesOf} from "../src/backupPolicy.js";
assert.equal(isMissingDriveReference(new Error("Error: ไฟล์ไม่ได้อยู่ในโฟลเดอร์เอกสารของ BHS E-Document")),true);
assert.equal(isMissingDriveReference(new Error("Exception: No item with the given ID could be found")),true);
assert.equal(isMissingDriveReference(new Error("Error: ไม่พบไฟล์นี้")),true);
assert.equal(isMissingDriveReference(new Error("รหัสสำรองข้อมูล Drive ไม่ถูกต้อง")),false);
assert.equal(isMissingDriveReference(new Error("NetworkError: Failed to fetch")),false);
assert.equal(isMissingDriveReference(new Error("Google Apps Script ไม่ส่งข้อมูล base64 กลับมา")),false);
const full={version:2,files:{a:{}},missingFiles:[],integrity:{status:"complete",expectedFileCount:1,archivedFileCount:1}};
assert.equal(isIncompleteArchive(full),false);
const partial={version:2,files:{},missingFiles:[{driveId:"gone",name:"gone.png",sources:["bhs_documents:DOC1"]}],
integrity:{status:"incomplete",expectedFileCount:1,archivedFileCount:0}};
assert.equal(isIncompleteArchive(partial),true);
assert.equal(missingFilesOf(partial).length,1);
assert.equal(isIncompleteArchive({...full,integrity:{expectedFileCount:3,archivedFileCount:2}}),true);
assert.equal(isIncompleteArchive({version:2,files:{}}),false,"legacy manifest without incompleteness markers still loads");
console.log("BHS backup incomplete archive and missing Drive policy: passed");