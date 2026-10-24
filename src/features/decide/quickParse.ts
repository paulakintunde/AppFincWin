// 05-08 (DCU-01): quick-check parse, port of prototype L4238-4241. The price comes from the
// caller's locale-aware amount parser (never parseFloat), so '1,800' and '1.800,00' follow
// the user's currency rules. Pure.
// WR-B08: the price is the last number in the text (model numbers, years and counts come first:
// "iPhone 15 Pro 1199", "2 tickets 150"). Only that number, and a currency sign right before it,
// leave the name; the rest of the name keeps its own digits, stops and casing.

const NUMBERS = /\d(?:[\d.,]*\d)?/g;
const CURRENCY_SIGN = /\p{Sc}\s*$/u;

/** Capitalises a plain first word ("car" → "Car") but leaves one with its own casing ("iPhone"). */
function capitalise(name: string): string {
  const second = name.charAt(1);
  if (second !== '' && second !== second.toLowerCase()) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function parseQuick(
  text: string,
  parse: (s: string) => number | null
): { name: string; price: number } | null {
  const input = text.trim();
  const matches = [...input.matchAll(NUMBERS)];
  const match = matches[matches.length - 1];
  if (match === undefined) return null;
  const price = parse(match[0]);
  if (price === null || price <= 0) return null;
  const start = match.index;
  const before = input.slice(0, start).replace(CURRENCY_SIGN, '');
  const after = input.slice(start + match[0].length);
  // A stop or comma left standing alone ("car 14500.") goes with the number.
  const name = `${before} ${after}`.replace(/(^|\s)[.,]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  return { name: capitalise(name), price };
}
