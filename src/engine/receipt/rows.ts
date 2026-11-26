// 10.1-15 (SCN-02): rows rebuilt from OCR lines. The reader returns lines in reading blocks (often every name, then
// every price), so rows come from frame positions: lines whose centres sit on one tilted baseline join, left to right.
import type { ReceiptFrame, ReceiptOcr } from './types';

export interface OcrRow { text: string; frame: ReceiptFrame | null; lineIndexes: number[] }

interface Placed { i: number; text: string; f: ReceiptFrame; cx: number; cy: number }

/** Candidate slopes (vertical px per horizontal px), nearest level first: up to tan(3.4 deg) either way. */
const SLOPES: number[] = [0];
for (let k = 1; k <= 24; k += 1) SLOPES.push(k / 400, -k / 400);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
}

/** The tilt that puts the most side-by-side line pairs on one baseline (first best wins, so level is preferred). */
function bestSlope(ps: Placed[], tol: number): number {
  const pairs: Array<[number, number]> = [];
  for (const a of ps) for (const b of ps) if (a.f.left + a.f.width <= b.f.left) pairs.push([b.cx - a.cx, b.cy - a.cy]);
  let best = 0;
  let bestScore = 0;
  for (const s of SLOPES) {
    let score = 0;
    for (const [dx, dy] of pairs) if (Math.abs(dy - s * dx) <= tol) score += 1;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

function union(fs: ReceiptFrame[]): ReceiptFrame {
  const left = Math.min(...fs.map((f) => f.left));
  const top = Math.min(...fs.map((f) => f.top));
  const right = Math.max(...fs.map((f) => f.left + f.width));
  const bottom = Math.max(...fs.map((f) => f.top + f.height));
  return { left, top, width: right - left, height: bottom - top };
}

export function groupRows(ocr: ReceiptOcr): OcrRow[] {
  const kept = ocr.lines.map((l, i) => ({ i, text: l.text.trim(), f: l.frame })).filter((l) => l.text !== '');
  if (!kept.every((l) => l.f !== null)) return kept.map((l) => ({ text: l.text, frame: l.f, lineIndexes: [l.i] }));
  const ps: Placed[] = kept.map((l) => {
    const f = l.f as ReceiptFrame;
    return { i: l.i, text: l.text, f, cx: f.left + f.width / 2, cy: f.top + f.height / 2 };
  });
  const h = ps.length > 0 ? median(ps.map((p) => p.f.height)) : 0;
  const slope = bestSlope(ps, h / 4);
  const keyed = ps.map((p) => ({ p, key: p.cy - slope * p.cx })).sort((a, b) => a.key - b.key);
  const groups: Placed[][] = [];
  let start = Number.NEGATIVE_INFINITY;
  for (const { p, key } of keyed) {
    if (key - start > h / 2) {
      groups.push([]);
      start = key;
    }
    (groups[groups.length - 1] as Placed[]).push(p);
  }
  return groups.map((g) => {
    const byLeft = [...g].sort((a, b) => a.f.left - b.f.left);
    return { text: byLeft.map((p) => p.text).join(' '), frame: union(byLeft.map((p) => p.f)), lineIndexes: byLeft.map((p) => p.i) };
  });
}
