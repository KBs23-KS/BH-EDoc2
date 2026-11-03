import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileLink,preferredDocumentFile,signedPublicationMissing} from "../src/documentFilePolicy.js";

const original={name:"proposal.pdf",url:"https://drive.google.com/file/d/ORIGINAL/view"};
const signed={name:"proposal (ลงนามแล้ว).pdf",url:"https://drive.google.com/file/d/SIGNED/view"};
const approved={id:"doc1",type:"คำสั่งโรงเรียน",status:"เผยแพร่แล้ว",files:[original],signedFiles:[signed]};
assert.equal(preferredDocumentFile(approved).file,signed,"published orders must open the signed PDF");
assert.equal(preferredDocumentFile(approved).signed,true);
assert.equal(signedPublicationMissing(approved),false);
assert.equal(preferredDocumentFile({...approved,type:"หนังสือเวียนแจ้งรับทราบ"}).file,signed,"published circulars too");
assert.equal(preferredDocumentFile({...approved,signedFiles:[]}),null,"cannot present an unsigned draft as a signed order");
assert.equal(signedPublicationMissing({...approved,signedFiles:[]}),true);
assert.equal(preferredDocumentFile({...approved,status:"รอผู้อำนวยการ"}).file,original,"pending work uses latest original");
assert.equal(preferredDocumentFile({...approved,type:"หนังสือเข้า",signedFiles:[]}).file,original,"incoming mail still opens original");
assert.equal(preferredDocumentFile({...approved,type:"หนังสือเข้า"}).file,signed,"signed file wins if present");
assert.equal(fileLink({driveId:"signedDriveId"}),"https://drive.google.com/file/d/signedDriveId/view");
assert.equal(fileLink({url:"javascript:alert(1)"}),"","never use unsafe link schemes");

const extension=readFileSync(new URL("../src/Extensions.jsx",import.meta.url),"utf8");
const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
assert.ok(extension.includes("preferredDocumentFile(d)"),"SearchCenter uses signed-first file policy");
assert.ok(extension.includes('เปิด PDF ที่ ผอ. ลงนามแล้ว'),"signed file link is clearly named");
assert.ok(extension.includes("signedPublicationMissing(d)"),"missing signed file explicitly warned");
assert.ok(app.includes("remember:rememberLogin"),"login sends selected device persistence policy");
assert.ok(app.includes("const [rememberLogin,setRememberLogin] = useState(false)"),"personal-device persistence requires explicit opt-in");
assert.ok(app.includes('fetch("/api/app-session",{method:"GET"'),"refresh still validates browser session");
assert.ok(app.includes('fetch("/api/app-session",{method:"DELETE"'),"explicit logout clears session");
console.log("Signed document preview, legacy handling and personal-device login choice passed");
