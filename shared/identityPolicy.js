/**
 * Server-side prerequisites for exchanging a BHS application session for
 * a Firebase custom-auth identity. This module contains no private keys.
 *
 * A Firebase UID is deliberately the existing school-user document ID.
 * Never use usernames (which can change) or roles as Firebase UIDs.
 */
export const isSchoolUid = value =>
  typeof value==="string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);

export const canExchangeSchoolIdentity = (session,user,expectedTag) =>
  Boolean(
    session &&
    user &&
    isSchoolUid(user.id) &&
    session.userId===user.id &&
    user.status!=="inactive" &&
    typeof session.credentialTag==="string" &&
    session.credentialTag.length===24 &&
    session.credentialTag===expectedTag &&
    typeof user.role==="string" &&
    ["admin","director","deputy","clerk","teacher"].includes(user.role)
  );

export const schoolIdentityClaims = () => ({
  // Identity only: authorization must be checked against current school-user
  // records under strict Firestore Rules, not against stale client-side roles.
  bhsSchoolIdentity: true
});
