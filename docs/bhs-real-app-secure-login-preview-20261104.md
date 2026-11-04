# BHS E-Document — real App secure-login integration (PREVIEW ONLY; 4 Nov 2026)

## Summary
This branch is **real src/App.jsx work**, not an additional demonstration UI. It is stacked on the already-existing Draft PR #39 authentication-server foundations, which supply /api/auth-identity and /api/school-directory. It does not change existing real school data, Firestore Rules, the school Vercel deployment or any teacher passwords.

The new path is **disabled by default**. Code selection requires VITE_BHS_SECURE_LOGIN_PREVIEW=true in a separately approved, isolated environment. The server APIs in PR #39 are independently blocked in Vercel Production; their special preview flags remain disabled unless separately authorized. Do not set the flags in the live Vercel project.

When explicitly enabled in a suitable isolated rehearsal:
1. No signInAnonymously fallback and no initial read of the Firestore bhs_users collection.
2. Username and existing password are POSTed over same-origin HTTPS to /api/app-session, which verifies credentials against the real school-user record server-side. The original login names and passwords are preserved. The website HttpOnly cookie remembers login for 7 days.
3. /api/auth-identity exchanges the verified cookie for a Firebase custom token; /api/school-directory returns profiles without password fields.
4. The browser signs in with a verified Firebase UID and loads only the sanitized directory; previously remembered app cookies are verified before attempting authentication.
5. Logout invalidates the website cookie and signs out from Firebase Auth; the PDF signing session remains separate.

## What this does NOT yet fix
The existing app still has collection-wide onSnapshot queries, direct document writes and legacy account/password mutations. Strict Firestore Rules cannot be enabled until those reads/writes are migrated and tested. Legacy credentials remain in the current database and are readable under broad Rules if the published ruleset permits such access. This branch DOES NOT protect production Firestore by itself. It also does not enable server credential hashing, migrate plaintext password fields, sign PDFs, change backup behavior or change the deployed login screen.

The feature must not be switched on against live production data simply to trial it. The isolated Firebase test Preview uses a different data model and is NOT a safe drop-in staging deployment for the live BHS app.

## Automated validation
- node tests/secure-app-login-integration-test.mjs: fake API / token stubs, expected profile and credential data validation, no browser pre-login Firestore read in secure mode, wrong/missing token rejection, expired session behavior, no anonymous fallback.
- npm run build: pre-existing regression suite and Vite build.
- GitHub Actions runs both automatically for the Draft PR.
- No real users, Firebase credentials, or databases are accessed by tests.

## Next actual code work
Replace all document/reservation/settings/audit full-collection listeners and direct privileged browser mutations with authenticated server endpoints or strict query rules. Isolate and hash legacy user passwords without exposing hashes to any client; ensure password-change and admin user-management flows migrate atomically. Validate complete backup/rollback plus PDF signing and all school roles in a non-production database with fake accounts.

**Do not merge this Draft PR or deploy/enable the feature on bhs-edoc-2 without a separate complete release approval.**

## Additional real-App integration completed on 4 November 2026

In the same Draft PR #45, the code now includes all of the following **OFF-by-default** adaptations:

- Secure preview is pinned to Firebase `bhs-edoc-security-test` and fails closed if the preview target is not that exact project. The non-test BHS Firebase configuration is selected ONLY when secure mode is NOT requested.
- The server Admin Firebase project and signed-session key are separately selected by `BHS_SERVER_ISOLATED_PREVIEW=true` and require test-only credentials. A production Vercel environment cannot enable these flags. Misconfigured previews with custom-auth/directory/data/routing/workflow enabled may not use production Admin service-account credentials.
- `api/secure-data.js` returns only a server-filtered selection of authorized BHS-shaped documents, reservations, reminders and whitelisted school settings. The secure preview does not subscribe to full user/document/settings collections in the browser.
- `api/secure-routing.js` performs director routing, head forwarding, acting-head authority, reassignments and own acknowledgement with a server-verified cookie, fresh database roles and a Firestore transaction. Each successful command writes an audit entry atomically; the browser cannot set privileged document fields directly through this endpoint.
- `api/secure-workflow.js` performs deputy review, director review of **incoming documents** and send-back corrections. Order/circular approval is deliberately refused until a verified server-side PDF-signing pipeline is implemented. Client-provided signed-file metadata is never trusted.
- `src/routingActions.js` and the actual `src/App.jsx` use those server APIs when the isolated flag is enabled. Legacy behavior is unchanged when the flag is OFF.
- The school Google Apps Script/Drive URL is disabled in isolated preview, and the school signing API is disabled while any preview migration flag is active.
- Added offline role/identity/recipient policy tests and existing web regression build.

### Explicit feature flags for an isolated rehearsal only

Browser build flags:
- `VITE_BHS_SECURE_LOGIN_PREVIEW=true`
- `VITE_BHS_SECURITY_TARGET=bhs-edoc-security-test`

Server-side test-only flags:
- `BHS_SERVER_ISOLATED_PREVIEW=true`
- `BHS_ENABLE_CUSTOM_AUTH_PREVIEW=true`
- `BHS_ENABLE_SECURE_DIRECTORY_PREVIEW=true`
- `BHS_ENABLE_SECURE_DATA_PREVIEW=true`
- `BHS_ENABLE_SECURE_ROUTING_PREVIEW=true`
- `BHS_ENABLE_SECURE_WORKFLOW_PREVIEW=true`

Separate server secrets `BHS_TEST_FIREBASE_SERVICE_ACCOUNT_JSON` and `BHS_TEST_SESSION_SECRET` would be required in a future separately authorized isolated environment. **Do not upload production credentials or configure these flags on the school Vercel project.** No deployment has been performed.

### Open mandatory tasks BEFORE claiming the security migration complete

1. Real school account passwords are still in legacy public-readable profiles under the currently deployed Firestore Rules. The secure preview keeps existing username/password login on the server, but it does NOT migrate those credentials to a private vault or Firebase Auth password storage. Do not publish any new credential hashes into Firestore while wildcard rules remain.
2. Several real document create/edit/number-register, admin account-management, PDF upload/sign, backup/restore and report functions still perform direct browser Firestore writes/list reads outside the newly migrated review/routing pathways. These must move server-side or receive narrowly scoped Rules.
3. A Firebase test project with the actual BHS-shaped collections, completely fictional data, and matching restrictive Rules is required. The existing `bhs_security_test_documents` fixture is not the same schema.
4. The secure session, role revocation, document workflows, numbered registers, PDF signature integrity, Drive ACLs, restore/rollback, and iPad/desktop behavior all require an actual staging run with a backup/recovery drill.
5. Draft PR #45 MUST remain unmerged, with feature flags OFF. No real Firestore Rules change, credentials migration, school deployment, or Drive write has been authorized/performed.

**Status: source integration and automated tests only; NOT live and NOT production-ready.**

## 4 Nov — credential-preserving migration implemented and emulator-tested

The same Draft PR now includes `api/_schoolCredentialVault.js`, a private scrypt-hash credential vault adapter, and a **one-time, transactionally atomic** migration of synthetic accounts. Its guards demand all of these conditions: `VERCEL_ENV` not production; `BHS_SERVER_ISOLATED_PREVIEW=true`; `BHS_ENABLE_PRIVATE_CREDENTIALS_PREVIEW=true`; `BHS_CREDENTIAL_VAULT_AUDITED=true`; exactly `FIRESTORE_EMULATOR_HOST=127.0.0.1:8099`; the explicit test project ID `bhs-edoc-security-test`; and a `TEST_...` UID at the exact BHS fixture user path. It cannot migrate any real teacher in its present form.

- The existing username, role, group membership and password are preserved. Even one-character and Thai legacy passwords work, unlike a direct Firebase Authentication password migration that requires six or more characters.
- The migration writes the salted hash + unique `credentialVersion` to server-only `bhs_private_credentials/{uid}` and deletes the legacy `password` field from the user profile **in the same transaction**. It rejects duplicate migrations and conflicting source updates; it logs no credentials.
- `api/app-session.js` can verify against the vault when explicitly enabled. It refuses a misconfigured vault and does **not** fall back to plaintext/default-password verification for a migrated account. `appSessionFingerprint` keeps legacy cookie behavior before migration and uses the private credential revision after migration.
- The test uses `security/firestore-credential-vault.emulator.rules` (deny-all browser permissions, no live deployment) with `security/firebase-credential-vault.emulator.json` on port 8099. It creates four **fake** accounts and runs the **actual** BHS login API with their unchanged usernames/passwords, checking incorrect passwords, 7-day cookies, revoked old sessions, private hash storage and denied client reads.
- CI run `41781233562` passed four fake accounts including a short password, the legacy default, and a Thai password; the complete web regression suite and Vite build passed.

**CRITICAL: No school account has been migrated yet.** The currently published school Firestore Rules and existing backups may still expose plaintext passwords. The test-only migration is deliberately prohibited outside the local emulator. The real credential cutover requires a separate safe production migration procedure that first protects **all** old account records, confirms real user roster/backup compatibility, and enables server-only account editing. Never turn on flags or publish these temporary rules on `bhs-edoc-2` just to see if it works.

## Further migration work — 4 November 2026 (same Draft PR #45)

### Admin user management
- `api/_secureAccountManagement.js` and `api/secure-users.js` now implement **emulator-only**, trusted admin profile management. The existing `UserManagementView` dispatches create/edit/disable/enable/delete to the server in isolated secure mode.
- The server rechecks the current admin's role and status in a transaction, checks usernames case-insensitively, serializes changes with a username lock, stores any new password as a private salted scrypt hash, updates `credentialVersion` on an actual reset, and writes an independent audit record.
- Editing a user's name, role or membership **without typing a password** does not change that person's password. Existing username casing and all unrelated accounts remain unchanged. Password resets affect only the intended account.
- Self-deactivation/self-deletion and credential resets through arbitrary client field writes are prohibited. New accounts require an explicit password in isolated secure mode. An inactive account cannot log in.
- Firestore Emulator integration runs the **actual BHS admin API** with synthetic signed 7-day sessions and confirms credential preservation, duplicate-username denial, role checks, private hash storage and audit integrity.

### Incoming register and document management
- `api/_secureIncomingDocuments.js` and `api/secure-documents.js` provide isolated-server-only incoming document metadata registration, editing and soft deletion, with a per-Buddhist-year lock, number-duplication detection, current-role checks, and atomic document/counter/audit updates.
- The existing `FormDocument` and `AdvancedSearchTable` call these server routes in secure mode for incoming metadata. The read-screen acknowledgement is routed through the already protected `/api/secure-routing` pathway.
- File upload, post-approval attachments, returned document PDF resubmission, and unsigned order/circular creation are **blocked** in secure test mode. The test backend never fabricates a signed PDF, accepts arbitrary client-supplied Drive IDs or uploads to the school's Google Apps Script.
- Test-only register rules preserve existing BHS policy: duplicates within an active incoming-book year are refused; documents moved to the trash remain in history and do not reserve a number.

### Audit log and emulator isolation
- The existing admin Audit Log screen uses `/api/secure-audit` in secure mode, not a broad Firestore collection listener. The feed requires an active admin session, returns a bounded window and discards unapproved fields (including accidental password/hash attributes).
- `BHS_SERVER_ISOLATED_PREVIEW=true` now additionally requires **FIRESTORE_EMULATOR_HOST=127.0.0.1:8099** for any test Backend operation. Missing the Emulator host cannot silently cause a connection to the actual `bhs-edoc-2` Firebase Admin project.
- Additional isolated server flags: `BHS_ENABLE_SECURE_USERS_PREVIEW`, `BHS_ENABLE_SECURE_DOCUMENTS_PREVIEW`, and `BHS_ENABLE_SECURE_AUDIT_PREVIEW`. Do not set these in Vercel or either live Firebase environment.

### What remains before production usage

**This is a tested source-code integration, not a complete or deployed security cutover.**
The following remain mandatory: (1) audit published production Firestore Rules and all access paths; (2) controlled migration of every actual credential into a private store with verified rollback and no exposure through backups; (3) server migration of order/outgoing-register and remaining document actions; (4) actual trusted Google Drive/PDF upload/signing pipeline and revision history; (5) full staging tests for all menus and roles, including iPad, plus end-to-end recovery rehearsal. Never publish the Emulator deny-all Rules over the school database. Keeping the current production login unchanged is intentional until all release gates pass.
