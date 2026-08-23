export function getUserDisplayName(
  nameAr: string,
  nameEn: string,
  languagePref: 'ar' | 'en' | 'both',
): string {
  if (languagePref === 'ar') return nameAr;
  if (languagePref === 'en') return nameEn;
  return `${nameAr} / ${nameEn}`;
}

export function getOrCreateConversationId(
  currentId: string | undefined,
): string {
  return currentId ?? crypto.randomUUID();
}

export function isStorageImage(content: string): boolean {
  return content.startsWith('chat-media:');
}

export function storagePathFromContent(content: string): string {
  return content.replace('chat-media:', '');
}

export const CHAT_FILE_PREFIX = 'chat-file:';

export function isStorageFile(content: string): boolean {
  return content.startsWith(CHAT_FILE_PREFIX);
}

export function filePathFromContent(content: string): string {
  return content.replace(CHAT_FILE_PREFIX, '');
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
