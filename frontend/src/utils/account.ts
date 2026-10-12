/**
 * A deleted account keeps its row, with its email replaced by
 * `deleted+<id>@deleted.invalid` (backend `services/account.service.js`,
 * `DELETED_EMAIL_DOMAIN`), because other businesses' records still point at it.
 * Wherever the app would print that address — the Team list keeps removed
 * members — it says "Deleted account" instead. The suffix is the contract with
 * the backend, so the two must change together.
 */
const DELETED_EMAIL_SUFFIX = '@deleted.invalid';

export function isDeletedAccount(user: { email: string }): boolean {
  return user.email.endsWith(DELETED_EMAIL_SUFFIX);
}
