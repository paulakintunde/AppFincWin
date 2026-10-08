/**
 * WCAG 2.x contrast ratio between two #RRGGBB colours. A test helper for the token palette
 * (AA body text needs 4.5:1). Pure; reads no theme and holds no colour literals.
 */
function channel(hex: string, start: number): number {
  const v = parseInt(hex.slice(start, start + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new RangeError(`contrast: "${hex}" is not a #RRGGBB colour`);
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
