/**
 * 05-106 (D-88, UI-SPEC R16.16 M7): a dev-only timing harness. Everything here is a no-op unless the build was made with
 * `EXPO_PUBLIC_PERF=1`, so a production build neither times nor logs anything. Marks come in pairs, `<name>:start` and
 * `<name>:end`; the harness keeps the durations only (no amounts, no inputs) and `perfReport` gives the median and p95 over
 * the last 30 of each name (the verdict, the details and E4). The device budgets are checked in 05-26.
 */
export const PERF_WINDOW = 30;

export interface PerfStat {
  count: number;
  median: number;
  p95: number;
}

const starts = new Map<string, number>();
const samples = new Map<string, number[]>();

/** Read at call time, so a test can switch it. Expo inlines the value in a build. */
export function perfEnabled(): boolean {
  return process.env.EXPO_PUBLIC_PERF === '1';
}

/**
 * `perfMark('verdict:start')` then `perfMark('verdict:end')` records one duration in milliseconds.
 * `perfMark('home.cardBottom', 450)` records a plain measured value (05-117: layout bottoms in px) under that name.
 */
export function perfMark(mark: string, value?: number): void {
  if (!perfEnabled()) return;
  if (value !== undefined) {
    const list = samples.get(mark) ?? [];
    list.push(value);
    if (list.length > PERF_WINDOW) list.shift();
    samples.set(mark, list);
    return;
  }
  const now = performance.now();
  if (mark.endsWith(':start')) {
    starts.set(mark.slice(0, -':start'.length), now);
    return;
  }
  if (!mark.endsWith(':end')) return;
  const name = mark.slice(0, -':end'.length);
  const began = starts.get(name);
  if (began === undefined) return;
  starts.delete(name);
  const list = samples.get(name) ?? [];
  list.push(now - began);
  if (list.length > PERF_WINDOW) list.shift();
  samples.set(name, list);
}

function statOf(list: readonly number[]): PerfStat {
  const sorted = [...list].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
  return { count: sorted.length, median, p95 };
}

/** The median and p95 of each timed name over its last 30 samples; `{}` when the harness is off. Also logged once. */
export function perfReport(): Record<string, PerfStat> {
  if (!perfEnabled()) return {};
  const report: Record<string, PerfStat> = {};
  for (const [name, list] of samples) report[name] = statOf(list);
  console.log('[perf]', JSON.stringify(report));
  return report;
}

/** Clears every sample (a test seam, and a fresh run on device). */
export function perfReset(): void {
  starts.clear();
  samples.clear();
}
