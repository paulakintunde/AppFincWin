// 05-08 (DCU-01): quick-check parse, port of prototype L4238-4241. The price comes from the
// caller's locale-aware amount parser (never parseFloat), so '1,800' and '1.800,00' follow
// the user's currency rules. Pure.

const FIRST_NUMBER = /[\d][\d.,]*/;
const ALL_NUMBER_CHARS = /[\d.,]+/g;

export function parseQuick(
  text: string,
  parse: (s: string) => number | null
): { name: string; price: number } | null {
  const input = text.trim();
  const match = FIRST_NUMBER.exec(input);
  if (match === null) return null;
  const price = parse(match[0]);
  if (price === null || price <= 0) return null;
  const stripped = input.replace(ALL_NUMBER_CHARS, '').trim();
  const name = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  return { name, price };
}
