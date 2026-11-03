/**
 * Username identity comparisons are case-insensitive; passwords are not.
 * Do not rewrite stored usernames: existing accounts keep their display casing.
 */
export function normalizeUsername(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Fail closed on ambiguous legacy data (e.g. two stored accounts T001/t001).
 * Never choose whichever account Firestore or a client happens to list first.
 */
export function findUniqueUsernameAccount(users, username) {
  const key = normalizeUsername(username);
  if (!key) return null;
  let match = null;
  for (const user of users) {
    if (normalizeUsername(user?.username) !== key) continue;
    if (match) return null;
    match = user;
  }
  return match;
}

export function usernameTakenByAnother(users, username, currentUserId) {
  const key = normalizeUsername(username);
  return key !== "" && users.some(user =>
    user?.id !== currentUserId && normalizeUsername(user?.username) === key
  );
}
