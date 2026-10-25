// 05-35: pure chart geometry (D-26, D-31). Pixel floats only; an amount is never returned or
// modified here (MON-01). Ticks are rounded to whole currency units in minor units BEFORE scaling.
export interface ChartBox {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}
export interface YTicks {
  readonly max: number;
  readonly zero: 0;
  readonly min: number;
}
export type Series = readonly (number | null)[];

const PAD_LEFT = 36;
const PAD_RIGHT = 8;
const PAD_TOP = 8;
const PAD_BOTTOM = 22;

export function chartBox({ width, height }: { width: number; height: number }): ChartBox {
  return { x0: PAD_LEFT, x1: width - PAD_RIGHT, y0: PAD_TOP, y1: height - PAD_BOTTOM };
}

export function yTicks(series: readonly Series[], extra: readonly number[], exponent: number): YTicks {
  const unit = 10 ** exponent;
  let hi = 0;
  let lo = 0;
  for (const v of [...series.flat(), ...extra]) {
    if (v === null) continue;
    if (v > hi) hi = v;
    if (v < lo) lo = v;
  }
  const max = Math.ceil(hi / unit) * unit;
  const min = Math.floor(lo / unit) * unit;
  return { max: max === min ? min + unit : max, zero: 0, min };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function xAt(index: number, length: number, box: ChartBox): number {
  return length > 1 ? box.x0 + ((box.x1 - box.x0) * index) / (length - 1) : box.x0;
}

function yAt(value: number, box: ChartBox, ticks: YTicks): number {
  return box.y0 + ((ticks.max - value) / (ticks.max - ticks.min)) * (box.y1 - box.y0);
}

export function pathFor(values: Series, box: ChartBox, ticks: YTicks): string {
  const parts: string[] = [];
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    parts.push(`${pen ? 'L' : 'M'} ${round2(xAt(i, values.length, box))} ${round2(yAt(v, box, ticks))}`);
    pen = true;
  });
  return parts.join(' ');
}

export function lastValue(values: Series): { value: number; index: number } | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== null && v !== undefined) return { value: v, index: i };
  }
  return null;
}

export function markerPoint(index: number, values: Series, box: ChartBox, ticks: YTicks): { x: number; y: number } | null {
  const v = values[index];
  if (v === null || v === undefined) return null;
  return { x: round2(xAt(index, values.length, box)), y: round2(yAt(v, box, ticks)) };
}

export function indexAtX(x: number, length: number, box: ChartBox): number {
  if (length < 2) return 0;
  const raw = Math.round(((x - box.x0) / (box.x1 - box.x0)) * (length - 1));
  return Math.min(length - 1, Math.max(0, raw));
}

/** Tick indices: `parts` equal divisions of the span (3 for the 90-day path, 4 for a month horizon). */
export function xTicks(length: number, parts = 3): number[] {
  const n = Math.max(0, length - 1);
  const out = new Set<number>();
  for (let k = 0; k <= parts; k++) out.add(Math.round((n * k) / parts));
  return [...out];
}
