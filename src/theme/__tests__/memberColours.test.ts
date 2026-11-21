// 09-26 (owner exception 2026-11-19): the 12 member colours for an Extended plan.
// Contrast uses the WCAG formula in ../contrast. Distance is CIEDE2000 (sRGB D65 -> Lab, kL = kC = kH = 1).
import { ACCENTS } from '../accents';
import { contrastRatio } from '../contrast';
import { colors, memberColorNames, memberColors, pageTint, stateColors } from '../tokens';

type Lab = readonly [number, number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Standard CIEDE2000 (Sharma, Wu, Dalal 2005), kL = kC = kH = 1. */
function deltaE2000Lab(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hp = (b: number, a: number) => (b === 0 && a === 0 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360);
  const h1p = hp(b1, a1p);
  const h2p = hp(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
    else hbarp = (h1p + h2p - 360) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.2 * Math.cos(rad(4 * hbarp - 63));
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

function hexToLab(hex: string): Lab {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const r = lin(parseInt(hex.slice(1, 3), 16) / 255);
  const g = lin(parseInt(hex.slice(3, 5), 16) / 255);
  const b = lin(parseInt(hex.slice(5, 7), 16) / 255);
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X / 0.95047);
  const fy = f(Y / 1);
  const fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE2000(hexA: string, hexB: string): number {
  return deltaE2000Lab(hexToLab(hexA), hexToLab(hexB));
}

const FIRST_SIX = ['#1B4D3E', '#B4472A', '#3E5C6B', '#7E6020', '#6E4A63', '#2F6E68'];
const grounds: [string, string][] = [
  ['surface', colors.surface],
  ['canvas', colors.canvas],
  ['fill1', colors.fill1],
  ['fill2', colors.fill2],
  ...Object.entries(pageTint).map(([k, v]): [string, string] => [`pageTint.${k}`, v]),
];
const namedColours = memberColors.map((hex, i) => [i, memberColorNames[i]!, hex] as const);

describe('deltaE2000 (reference check)', () => {
  it('matches the Sharma 2005 reference pair to 4 dp', () => {
    expect(deltaE2000Lab([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
  });
});

describe('the 12 member colours', () => {
  it('has 12 distinct upper-case #RRGGBB colours and 12 names', () => {
    expect(memberColors).toHaveLength(12);
    expect(memberColorNames).toHaveLength(12);
    expect(new Set(memberColors).size).toBe(12);
    for (const hex of memberColors) expect(hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('leaves the first six unchanged', () => {
    expect(memberColors.slice(0, 6)).toEqual(FIRST_SIX);
  });

  it.each(namedColours)('colour %i (%s, %s) carries a white initial at 4.5:1 or better', (_i, _name, hex) => {
    expect(contrastRatio(hex, colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  describe.each(namedColours)('colour %i (%s, %s)', (_i, _name, hex) => {
    it.each(grounds)('reaches 4.5:1 on %s', (_g, ground) => {
      expect(contrastRatio(hex, ground)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it.each([6, 8, 10, 11])('key %i reuses a hex that is already in the token files', (i) => {
    const existing = new Set<string>(
      [
        ...Object.values(colors),
        ...Object.values(ACCENTS),
        ...Object.values(stateColors).map((s) => s.color),
      ]
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.toUpperCase()),
    );
    expect(existing.has(memberColors[i]!)).toBe(true);
  });

  it('adds exactly two new hexes, Magenta and Orange, and they live only in memberColors', () => {
    expect(memberColors[7]).toBe('#A62D8C');
    expect(memberColors[9]).toBe('#A65600');
    const others = [
      ...Object.values(colors),
      ...Object.values(ACCENTS),
      ...Object.values(pageTint),
      ...Object.values(stateColors).flatMap((s) => [s.color, s.stroke, s.tint]),
    ]
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.toUpperCase());
    expect(others).not.toContain('#A62D8C');
    expect(others).not.toContain('#A65600');
  });

  const newOnes = [7, 9] as const;
  const pairs = newOnes.flatMap((n) =>
    memberColors.map((hex, i) => [n, memberColorNames[n]!, i, memberColorNames[i]!, hex] as const).filter(([, , i]) => i !== n),
  );
  it.each(pairs)('colour %i (%s) is CIEDE2000 12 or more from colour %i (%s)', (n, _nn, _i, _name, hex) => {
    expect(deltaE2000(memberColors[n]!, hex)).toBeGreaterThanOrEqual(12);
  });
});
