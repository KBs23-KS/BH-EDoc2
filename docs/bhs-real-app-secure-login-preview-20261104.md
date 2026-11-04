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
