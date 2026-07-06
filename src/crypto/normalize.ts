/**
 * Normalizes a string for use in blind-index computation: trims whitespace,
 * lowercases, and strips diacritics (accents) via Unicode NFD decomposition
 * so that e.g. "Bancámiga " and "bancamiga" normalize identically
 * (Property 5: Normalization Equivalence; Requirements 10.1, 10.3).
 */
// Unicode combining diacritical marks block (U+0300-U+036F), produced by
// NFD decomposition of accented characters (e.g. "á" -> "a" + U+0301).
const COMBINING_MARKS = /[̀-ͯ]/g;

export function normalize(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '');
}
