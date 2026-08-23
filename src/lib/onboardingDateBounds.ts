/** ISO date YYYY-MM-DD for HTML date inputs and validation. */

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Staff: 18–70 years old → DOB between (today−70) and (today−18). */
export function staffDateOfBirthBounds(): { min: string; max: string } {
  const today = new Date();
  const min = new Date(today);
  min.setFullYear(min.getFullYear() - 70);
  const max = new Date(today);
  max.setFullYear(max.getFullYear() - 18);
  return { min: isoDate(min), max: isoDate(max) };
}

export function isStaffAgeValid(dobIso: string): boolean {
  const { min, max } = staffDateOfBirthBounds();
  if (!dobIso?.trim() || !isValidIsoDate(dobIso)) return false;
  return dobIso >= min && dobIso <= max;
}

/** Child: 3 months–6 years → DOB between (today−6y) and (today−3mo). */
export function childDateOfBirthBounds(): { min: string; max: string } {
  const today = new Date();
  const min = new Date(today);
  min.setFullYear(min.getFullYear() - 6);
  const max = new Date(today);
  max.setMonth(max.getMonth() - 3);
  return { min: isoDate(min), max: isoDate(max) };
}

export function isChildAgeValid(dobIso: string): boolean {
  const { min, max } = childDateOfBirthBounds();
  if (!dobIso?.trim() || !isValidIsoDate(dobIso)) return false;
  return dobIso >= min && dobIso <= max;
}
