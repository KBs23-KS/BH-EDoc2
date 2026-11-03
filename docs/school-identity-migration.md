# BHS E-Document — Safe school identity migration (ADMIN-ONLY)

STATUS: Preparation phase only. DO NOT enable this on production or publish new Firestore Rules yet.

## Goal
Teachers keep the SAME school URL, username, password and roles. No Firebase signup, personal Google account or reinstallation is required. If an old remembered session expires, the user may need to log in once with existing credentials.

## What was prepared
- api/auth-identity.js: opt-in server-side Firebase Custom Authentication token exchange based on an existing verified, signed HttpOnly BHS app session; it accepts GET only and never accepts a client-supplied user ID.
- Existing school document ID becomes Firebase Auth UID, so account renaming and role changes do not change identity.
- Active status and current credential fingerprint are verified server-side before the Firebase Admin SDK issues a token.
- Custom token carries the bhsSchoolIdentity marker but NOT an authorization role. Strict rules will evaluate the currently active account, not a stale client role.
- Feature gate BHS_ENABLE_CUSTOM_AUTH_PREVIEW defaults OFF; if OFF the endpoint returns 503 and existing login is unchanged.
- The frontend, existing school Firestore rules, original school data and PDF signing session are NOT changed in this phase.

## Critical reasons to not enable strict Rules yet
1. The current client signs into Firebase anonymously before school login.
2. The current client reads ALL user profiles (and legacy password fields) before entering the school portal.
3. Client workflows read full collections (including all correspondence) then filter by role in JavaScript. Firestore queries do not support post-query authorization under strict rules.
4. Account creation, role changes, password changes and several document writes occur directly in the browser.
5. The July 2026 Firestore wildcard rule allows any Firebase-authenticated visitor to read and write every document. A narrower deny rule cannot override a broader allow rule.
6. Vercel Preview with the same bhs-edoc-2 Firebase config points at PRODUCTION school data. It is not an isolated safe test database.

## Required future phases BEFORE switching over
1. School admin creates and verifies a complete backup of Firestore records, connected PDF/Drive files and the ability to restore them.
2. Create isolated Firebase emulator tests or a separate test Firebase project for roles and documents. Do not use real school records for security experiments.
3. Migrate existing passwords to a private server-only collection using a slow salted password hash (e.g. scrypt or Argon2id), preserving each user's existing password. After migration remove plaintext password from all client-readable profiles and backup exports. Validate duplicate usernames and disabled users.
4. Change the login screen and browser bootstrap to call a server-side password-check endpoint, restore signed sessions, exchange for custom Firebase tokens, and never read credentials from Firestore. Never fall back to anonymous Firebase login in secure mode.
5. Move direct browser-side account and role changes to verified server APIs. Build document reads/writes using queries or server APIs compatible with least-privilege rules. Keep document histories and audit events atomically.
6. Write and test Firestore Rules per collection and role (users, settings, incoming, orders, circulars, reservations, audit, reminders, backups). Require valid Firebase school identity; ensure inactive users and teachers cannot read unauthorized files or write others' records. Verify get/list differences and relevant indexes.
7. Test admin, director, deputy, clerk, department head, subject head and teacher, including create/approve/sign/correct/archive/acknowledge/backup/restore. Test iPad/Android/desktop and multi-device session expiry.
8. Deploy login and rules together during a controlled window, verify with a test account, then invite teachers to continue normally. Roll back using documented backup and previous release if necessary.

## Administrator action required later
- Only a school administrator needs to manage Firebase, GitHub and Vercel. The ordinary teacher accounts do not need any manual migration.
- Never paste the Firebase Admin JSON, signing secret, or passwords into GitHub, chat, screenshots or public frontend variables.
- DO NOT manually edit or publish the existing Firestore Rules until the role-by-role migration tests are complete.
- The new BHS_ENABLE_CUSTOM_AUTH_PREVIEW server environment flag should remain absent/false at present; setting it to true on the live Vercel Production environment would not fix the public-data exposure and is not approved.

## Rollback
- The preparation code is inert by default; leaving the flag unset makes it a no-op.
- Do not disable Firebase Anonymous Authentication or delete user records until migration is fully tested and completed.
- Keep existing app-session and signing endpoints untouched through the preparation stage.

## Key sources
- Firebase Admin custom tokens: https://firebase.google.com/docs/auth/admin/create-custom-tokens
- Firebase Security Rules use OR across overlapping matches: https://firebase.google.com/docs/rules
- Firestore role-based authorization: https://firebase.google.com/docs/rules/basics