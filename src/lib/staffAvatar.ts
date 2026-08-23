/** Placeholder avatar for staff (users table has no avatar column in base schema). */
export function staffAvatarUrl(displayName: string): string {
  const q = encodeURIComponent(displayName.slice(0, 48) || 'Staff');
  return `https://ui-avatars.com/api/?name=${q}&background=001f3f&color=fff&size=128`;
}
