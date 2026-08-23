/** Extract token from full URL (?token=) or return trimmed raw payload. */
export function parseQrTokenFromText(raw: string): string {
  const t = raw.trim();
  const fromQuery = t.match(/[?&]token=([^&]+)/);
  if (fromQuery?.[1]) {
    try {
      return decodeURIComponent(fromQuery[1]);
    } catch {
      return fromQuery[1];
    }
  }
  return t;
}
