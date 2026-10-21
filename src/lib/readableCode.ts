/** Stored codes such as "manager_teacher" read as "Manager teacher"; free text is left as typed. */
export function readableCode(value: string): string {
  const text = value.trim();
  if (!text || /\s/.test(text) || !/^[a-z_]+$/.test(text)) return text;
  const words = text.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
