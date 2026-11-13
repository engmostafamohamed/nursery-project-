/** A list with one value added, or taken out when it is already there (a chosen day, hour, child or person). */
export function toggled<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
