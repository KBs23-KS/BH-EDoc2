# BHS E-Document — isolated Firebase security test

**Preparation only.** This PR must remain Draft and must NOT be merged into `main` or deployed to the current school Vercel project.

## Projects

- Live Firebase: `bhs-edoc-2` — **do not edit Firestore Rules, Auth, data or secrets**.
- Test Firebase: `bhs-edoc-security-test` — Firestore created in **production mode / default deny**; Authentication initialized, no providers needed; a separate Web App registered.
- Test code: `security-test/index.html` and `security-test/main.js` — standalone Vite HTML entry. This does **not** import `src/App.jsx`, log in real users, call school APIs, or write data.
- Existing server code and live Firebase settings remain unchanged.

## Safety gate on branch previews

Any Vercel Preview build of this PR **fails closed** unless all conditions are true:
1. `VERCEL_ENV=preview`.
2. `VERCEL_GIT_COMMIT_REF=security/isolated-firebase-test-20261103`.
3. `BHS_SECURITY_TEST_DEPLOY_TARGET=bhs-edoc-security-test`.

A normal Vercel deployment of the connected school project does **not** have this new target setting and should refuse to build this branch. A GitHub Actions ordinary build still uses the legacy entry; an isolated test build uses `security-test/index.html`. The test target is a plain build selector, **not a secret**.

## Local and GitHub-only validation

- `node tests/firebase-test-isolation-test.mjs`
- `npm run build` — normal regression build (does not deploy).
- `BHS_SECURITY_TEST_DEPLOY_TARGET=bhs-edoc-security-test npm run build` — test-only static entry, no school UI (does not deploy).

The PR CI performs both builds without database credentials and without deploying anything.

## Later: separately approved Vercel test project

**Do NOT import the repository as a new Vercel project yet without reviewing first-deployment behavior.** A newly imported project could initially deploy `main`, which still contains the legacy production Firebase configuration. Before any deployment, explicitly configure/verify the test project's branch and environment, and ensure it cannot run `src/App.jsx` or production Admin credentials. Never copy `BHS_FIREBASE_SERVICE_ACCOUNT_JSON`, backup secrets, signing secrets, GAS URLs or production Vercel environment variables into the test project.

Only after a separate approval, prepare an isolated preview project with `BHS_SECURITY_TEST_DEPLOY_TARGET=bhs-edoc-security-test` in its Preview environment, pointing to the exact security branch. Verify the built output is the **TEST ONLY** page and the project ID is `bhs-edoc-security-test` before allowing any manual Firestore probe. If the Vercel project cannot meet these conditions, **stop; do not deploy**.

## Current capabilities and limitations

- The test page has an explicit project ID guard and one optional **read-only** probe against a synthetic document. With default-deny Firestore Rules, an unauthenticated read should result in `permission-denied`.
- No actual Auth login, role-based security rules, access tests, document workflows, password migration or PR #39 integration has been implemented here yet.
- Do not copy school accounts, passwords, PDFs or records into this project.
- PR #39 remains a separate draft until role-based testing and an approved security migration plan are complete.


## Stage 2 — synthetic login and strict role-based Rules (new stacked Draft PR)

New branch: security/sandbox-login-firestore-20261103. This remains PREPARATION ONLY and targets PR #41, not main.

- The isolated web page now has a demo-only username/password form, Firebase Custom Token sign-in and sign-out, and synthetic document read checks. It never imports the production App.
- POST /api/security-test-login is disabled unless Vercel Preview, the exact Stage-2 branch, explicit opt-in environment flags, and **test-project-only** Firebase Admin JSON are all present.
- Synthetic passwords are stored as salted scrypt hashes in bhs_security_test_credentials. The collection is denied to every browser role, including admins. No real credential data was read/migrated.
- Credentials use a server-held HMAC username lookup key. No plaintext passwords/hashes are sent to the UI. Login attempts are transactionally throttled per username; add per-IP edge/WAF throttling before any production rollout.
- File security/firestore-security-test.rules denies all paths by default, including legacy school paths. Active synthetic test identity is required for test profiles, documents and acknowledgements.
- Rules are NOT deployed to either Firebase project. The rules have a separate Firebase Emulator configuration for offline testing.

### Future operator-only setup, NOT approved now

Create a separate, isolated test Vercel project only after review of initial auto-deployment and branch restrictions. The original BHS Vercel project must not receive ANY of the following environment variables. Required variables for the isolated sandbox Preview only:

- BHS_SECURITY_TEST_DEPLOY_TARGET=bhs-edoc-security-test
- BHS_SECURITY_TEST_API_ENABLED=true
- BHS_FIREBASE_SECURITY_TEST_SERVICE_ACCOUNT_JSON=<test-project service account JSON; server-only>
- BHS_SECURITY_TEST_INDEX_SECRET=<new random 32+-byte secret; server-only>

The fail-closed build guard from PR #41 intentionally blocks this new branch from deploying to the existing Vercel project. **Do not override the guard** as a workaround; first independently review the new test project setup.

The optional test-data seeder is scripts/seed-security-test-users.mjs, requires explicit BHS_SECURITY_TEST_SEED_CONFIRM=bhs-edoc-security-test, the target and server-only test JSON/secret, and refuses to run on Vercel. It creates only seven synthetic accounts and sample documents in test-specific collections and refuses to overwrite existing records. No user is required to run Node locally; an administrator may execute this from a controlled environment later.

### Automated offline verification

- node tests/sandbox-login-test.mjs (test-only login gates, scrypt, rule source protections)
- CI Firestore Emulator runs tests/firestore-security-test-emulator.mjs with @firebase/rules-unit-testing; there are no live Firebase requests and no real passwords.
- Both normal and isolated Vite builds remain part of CI.

**Not done**: deploy of test Firestore Rules, creating a new Vercel project, connecting to test Firebase Admin, seeding fake test credentials, manual browser sign-in, integrating PR #39 production login migrations, preserving actual teachers' passwords, authorization of all real document workflows or production access testing. These require separate gated steps.
