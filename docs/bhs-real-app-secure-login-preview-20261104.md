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
