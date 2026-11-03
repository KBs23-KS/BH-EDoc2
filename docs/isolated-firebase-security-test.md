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
