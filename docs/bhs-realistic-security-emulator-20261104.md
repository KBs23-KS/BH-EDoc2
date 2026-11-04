# BHS E-Document — realistic security acceptance suite (EMULATOR ONLY)
**4 Nov 2026 | Test-only stage | NEVER deploy these rules or fixtures to Firebase.**

## Hard isolation
- New branch: security/realistic-bhs-workflow-emulator-20261104, stacked on Draft PR #42.
- No changes to main, school Firebase bhs-edoc-2, separate Firebase bhs-edoc-security-test, school data, Drive/GAS, current production Vercel or the existing Vercel Preview.
- All IDs start TEST_, document IDs start TEST_DOC_, and PDF links point to invalid.example.
- Emulator project ID demo-bhs-realistic-only, port 8099, separate rules and config. No credentials.
- This rule file is NOT production-ready and must not be published to ANY Firebase project.

## Real BHS-shaped synthetic fields
Based on current main App.jsx, workflow.js, routing.js, routingActions.js and the PDF signing permission implementation:
- Three document types: หนังสือเข้า, คำสั่งโรงเรียน, หนังสือเวียนแจ้งรับทราบ.
- Thai statuses: รอรองผู้อำนวยการ, รอผู้อำนวยการ, ส่งกลับแก้ไข, อนุมัติ/สั่งการแล้ว, เผยแพร่แล้ว.
- docNumber, createdBy, files, signedFiles, fileVersions, activeFileVersion, recipientsSnapshot, routingEntries, headActions, assignmentAcknowledged, acknowledgedBy, acknowledgedAt, isDeleted and history.
- Admin, director, deputy, clerk, department head, subject head, normal teacher, outside-group teacher, acting head and inactive teacher. All are invented.

**Test-only proposed projection fields:** recipientIds, assignedUserIds, routedGroup. Current school app does not maintain these fields. They illustrate how to check individual document reads; a real migration must implement secure projection updates including multiple groups, reassignments and historical data.

## What the two suites assert
- Offline role and business policy: creates, deputy review, director return, correction with next PDF version, director approval, PDF source access, routing, head cross-subject vs subject-only assignments, acting head, reassignment, teacher-wide broadcast, acknowledgements and prohibited impersonation.
- Firestore Emulator: no anonymous/missing claim/inactive access, strict document visibility, private user profiles, forbidden whole-collection queries, forbidden direct browser mutations (including admin/director PDF/signature, numbers, routing, audit), per-recipient create-once receipts, no pre-approval receipts.
- Simulated verified backend transitions: clerk -> deputy -> return -> PDF version 2 -> deputy -> director approval -> director routes -> appointed head assigns -> assignee receives -> teacher acknowledges.
- Audit and document changes are grouped in an Emulator batch, after checking a synthetic server-side decision. This is NOT a deployed backend.
- PDF signing uses production allowedToSign as an authorization predicate, but does not draw, upload, sign, fetch or authenticate any actual PDF.

## Commands (local Firestore Emulator only)
1. node tests/bhs-realistic-workflow-policy-test.mjs
2. npx --yes firebase-tools@14 emulators:exec --project demo-bhs-realistic-only --config security/firebase-bhs-realistic.emulator.json --only firestore "node tests/firestore-bhs-realistic-emulator.mjs"

GitHub Actions runs both on the new stacked Draft PR. No Firebase credentials, project deployment, Cloud Shell or real data needed.

## Critical limits and blockers
1. The live school client still authenticates to Firebase anonymously, reads the users collection before school login and compares legacy passwords client-side. Under the candidate Rules, that client will fail.
2. The live client relies on collection-wide onSnapshot listeners; these candidate Rules deliberately deny list. New authenticated APIs and strict queries are necessary.
3. Test policy + withSecurityRulesDisabled are NOT production API handlers or hardening of the real system. Authorized operations are simulated only. The signedFiles field cannot be trusted if any browser has direct write access.
4. Current signing permission code authorizes director and admin for eligible PDF sources. Ownership must decide if admin signing is acceptable. Drive ACLs, document integrity, signature authenticity, iPad behavior and PDF byte handling remain untested.
5. Full real multi-group routing, stale acting-head changes, reassignment historical recipient scopes, order number concurrency, actual Firestore Rules, migration of credentials, backups and restoration are not covered.
6. Do not Merge any Draft PR, Publish these Rules, modify real credentials or Deploy the school website. A separate explicit approval and complete staging/rollback test will be required.

**Never copy or publish this synthetic rules file as the school production Rules.**
