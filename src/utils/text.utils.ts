/**
 * Compares two strings and returns the number of matching characters, beginning from left.
 * @param a
 * @param b
 * @returns The number of matching characters
 */
export function matchStrings(a: string, b: string): number {
  const max = Math.max(a.length, b.length);

  for (let i = 1; i <= max; i++) {
    if (!b.startsWith(a.slice(0, i))) {
      return i - 1;
    }
  }

  return max;
}
