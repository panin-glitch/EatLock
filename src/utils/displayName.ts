type AuthUserLike = {
  email?: string | null;
} | null | undefined;

type ProfileLike = {
  username?: string | null;
} | null | undefined;

export function getDisplayName(authUser: AuthUserLike, profile: ProfileLike): string {
  const fromProfile = profile?.username?.trim();
  if (fromProfile) return fromProfile;

  const fromEmail = authUser?.email?.split('@')[0]?.trim();
  if (fromEmail) return fromEmail;

  return 'User';
}
