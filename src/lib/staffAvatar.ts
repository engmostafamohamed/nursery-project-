/** Placeholder avatar for staff (users table has no avatar column in base schema). */
export function staffAvatarUrl(displayName: string): string {
  // Letters only, so "Demo Manager (HR)" gives "DM" and not "D(".
  const letters = displayName.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const q = encodeURIComponent(letters.slice(0, 48) || 'Staff');
  return `https://ui-avatars.com/api/?name=${q}&background=001f3f&color=fff&size=128`;
}
