/**
 * R2 key ownership check.
 *
 * All user uploads live under `uploads/<user_id>/…`.
 * This helper normalises leading slashes before checking.
 */
export function ownsR2Key(userId: string, key: string): boolean {
  const normalized = (key ?? '').replace(/^\/+/, '');
  return normalized.startsWith(`uploads/${userId}/`);
}
