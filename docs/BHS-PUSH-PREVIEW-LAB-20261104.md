# PR #46 — Web Push lab (Preview only)

This is an isolated test sender **only**, not school notifications.

- URL: /push-preview-lab.html
- API: /api/push-preview-lab (GET status, POST register/send/remove)
- Firebase project hard-enforced to bhs-edoc-security-test; custom named Firebase Admin app
- Firestore: bhs_push_lab_devices, bhs_push_lab_counters
- Data: encrypted subscriptions (AES-256-GCM), SHA-256 bearer capability, expires after 24 hours; no school document or staff data
- Restriction: VERCEL_ENV=preview + Git branch=feature/free-pwa-push-notifications-20261104
- Rate limit: 1 per 3 seconds, 10/day/device, global 60 sends/day, 40 registrations/day
- Public UI: browser permission and own-device opt-in; no anonymous access to other users' subscriptions
- Firestore Rules for both collections must deny browser read/write. Check *all* match statements, including catch-all; Rules grants are OR across matches.
- No production project, no production environment variables, no Merge or Production deployment.

## Vercel environment (branch-scoped Preview only)

BHS_PUSH_LAB_ENABLED=true
BHS_PUSH_LAB_FIREBASE_ADMIN_JSON=(service account from bhs-edoc-security-test only)
BHS_PUSH_LAB_RULES_VERIFIED=true (set only AFTER checking deployed test project Rules)
BHS_PUSH_LAB_VAPID_PUBLIC_KEY=(P-256 VAPID public key)
BHS_PUSH_LAB_VAPID_PRIVATE_KEY=(matching private key; Sensitive)
BHS_PUSH_LAB_VAPID_CONTACT=https://bhs-edocument.vercel.app
BHS_PUSH_LAB_ENCRYPTION_KEY=(32 random bytes base64url; Sensitive)

The API refuses to start unless **all** values are present, Rules have been verified, the Vercel environment is Preview, and the Git branch is this exact PR #46 branch. Do not put service-account JSON, VAPID private key, or encryption key in GitHub, the client bundle, or chat. Put credentials directly in Vercel.

## Test Firestore Rules (merge into the *test project's* existing Rules, do not overwrite other tests)

match /bhs_push_lab_devices/{id} { allow read, write: if false; }
match /bhs_push_lab_counters/{id} { allow read, write: if false; }

NOTE: Firestore rules are OR-combined; any broad catch-all allow may defeat these denies. Verify via Rules Playground/Emulator for anonymous and authenticated test clients. Firebase Admin bypasses client Rules.

## Test sequence

1. Confirm bhs-edoc-security-test Firestore is enabled (free Spark when within plan quotas).
2. Configure test project service account directly in the branch-scoped Vercel Secret.
3. Verify/test Rules deny browser access to the two test collections. Then set RULES_VERIFIED.
4. Redeploy **only PR #46 Preview**, open /push-preview-lab.html.
5. Opt in on the device, send own push, then move app into the background and try again after 60 s. iPad requires Home Screen PWA.
6. Check subscription deletion/expiry, shared devices, and rate limits. Do not use real school credentials or documents.
7. This is not end-to-end school event delivery. Keep the existing BHS_WEB_PUSH_ENABLED and VITE_BHS_ENABLE_PUSH disabled, until separately reviewed for real workflows.

## Simulated workflow-event routing (PR #46 Preview)

- The Preview Lab includes 6 **fixed synthetic** workflows (created/director/returned/published/route/head) from `shared/pushPreviewFixtures.js`.
- The API reuses `serverNotificationEvent` policy with fake users/documents ONLY. There is no Firestore read from the original school collections.
- A tester can select a mock event and recipient role on the existing lab page. If the policy rejects that role, no Push is sent and the send quota is not consumed.
- If eligible, the existing per-device capability token is checked server-side, the 3-second test-only cooldown and daily limits apply, and Push goes ONLY to the tester's own subscribed device.
- The client cannot provide arbitrary document contents, target endpoints, recipient lists or message text; the server builds all scenarios and payloads.
- This validates the routing policy + real Web Push transport to ONE opted-in device. It does NOT yet verify real account roles, multiple real devices, or guarantee that a school document write triggers a Push. Keep the original school notifications disabled.
