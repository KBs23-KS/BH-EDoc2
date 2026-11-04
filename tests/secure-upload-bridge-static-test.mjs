/**
 * Offline source regression guard for the new BHS secure upload boundary.
 * This test is pure Node and does not use Firebase, HTTP, Drive, or secrets.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const gas=read("../gas/Code.gs");
const app=read("../src/App.jsx");
const service=read("../api/_securePdfUpload.js");
const route=read("../api/secure-upload.js");
const server=read("../api/_signatureServer.js");
assert.match(gas,/data\.action === "secureUpload"/);
assert.match(gas,/getProperty\("BHS_UPLOAD_SECRET"\)/);
assert.match(gas,/getProperty\("BHS_ALLOW_LEGACY_UPLOAD"\) !== "true"/);
const privilegedPart=gas.split("// Compatibility only.")[0];
assert.doesNotMatch(privilegedPart,/setSharing\(/,
  "Verified PDF upload must never share school files publicly");
assert.match(gas,/getProperty\("BHS_BACKUP_SECRET"\)/);
assert.match(service,/PDFDocument\.load\(bytes/);
assert.match(service,/createHash\("sha256"\)/);
assert.match(service,/doc\.status==="รอรองผู้อำนวยการ"/);
assert.match(service,/tx\.get\(receiptRef\)/);
assert.match(service,/tx\.create\(receiptRef/);
assert.match(service,/assertCredentialVaultBoundary/);
assert.match(route,/requirePreviewSchoolSession\(req\)/);
assert.match(route,/enforceJsonSameOrigin\(req\)/);
assert.match(route,/BHS_ENABLE_SECURE_UPLOAD_PREVIEW/);
assert.match(route,/http:\/\/127\.0\.0\.1:8101\/upload/);
assert.doesNotMatch(route,/BHS_GAS_WEB_APP_URL/,
  "Local-only rehearsal must not read real school's GAS URL");
assert.match(server,/FIRESTORE_EMULATOR_HOST==="127\.0\.0\.1:8099"/);
assert.match(app,/const GAS_WEB_APP_URL = SECURE_LOGIN_REQUESTED \? ""/);
assert.match(app,/if\(SECURE_LOGIN_PREVIEW\)return showToast\(/,
  "Secure App must preserve its fail-closed client upload guards");
console.log("PASS: server-only PDF bridge, secret-gated private GAS, no public sharing, no production fallback");
