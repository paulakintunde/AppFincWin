// 05.4-34 (APP-04, D-130, D-131): the engine share of a key press, timed on device. prepare once on the heavy synthetic account,
// 20 untimed warm-up calls, then 200 timed judgeCheck calls cycling through the sample checks. The harness times every call
// itself (perfMarks keeps only the last 30 and is off without EXPO_PUBLIC_PERF=1) and also sends judge:start / judge:end so
// perfReport sees the last 30. Logs durations only: no amounts, no inputs (T-05.4-34-02). Developer strings, never shipped.
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { judgeCheck, prepare } from '@/engine/decide/v3';
import { perfMark } from '@/features/decide/perf/perfMarks';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { space } from '@/theme/layout';
import { heavyAccount, heavyChecks } from './heavyAccount';

export const PERF_WARMUP = 20;
export const PERF_CALLS = 200;

const LABEL_TITLE = 'Engine timing (judgeCheck, heavy account)';
const LABEL_RUN = 'Run 200 checks';

export interface PerfRun {
  p50: number;
  p95: number;
  n: number;
}

/** Nearest-rank percentile over a sorted copy (the same p95 rule as perfMarks' statOf). */
export function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] as number;
}

/** One run: prepare once, warm up, then time PERF_CALLS judgeCheck calls. */
export function runEngineTiming(now: () => number = () => performance.now()): PerfRun {
  const p = prepare(heavyAccount());
  const checks = heavyChecks();
  for (let i = 0; i < PERF_WARMUP; i++) judgeCheck(p, checks[i % checks.length]!);
  const times: number[] = [];
  for (let i = 0; i < PERF_CALLS; i++) {
    const check = checks[i % checks.length]!;
    perfMark('judge:start');
    const t0 = now();
    judgeCheck(p, check);
    const t1 = now();
    perfMark('judge:end');
    times.push(t1 - t0);
  }
  const run = { p50: percentile(times, 0.5), p95: percentile(times, 0.95), n: times.length };
  console.log(`[perf] judgeCheck p50=${run.p50.toFixed(2)} p95=${run.p95.toFixed(2)} n=${run.n}`);
  return run;
}

export function EnginePerfHarness() {
  const [runs, setRuns] = useState<PerfRun[]>([]);
  const onRun = useCallback(() => setRuns((r) => [...r, runEngineTiming()]), []);
  const last = runs[runs.length - 1];
  return (
    <View style={styles.block}>
      <Text>{LABEL_TITLE}</Text>
      <View testID="perf-run">
        <Pill label={LABEL_RUN} variant="primary" onPress={onRun} />
      </View>
      {last !== undefined ? (
        <>
          <Text testID="perf-p50">{`p50 ${last.p50.toFixed(2)} ms`}</Text>
          <Text testID="perf-p95">{`p95 ${last.p95.toFixed(2)} ms`}</Text>
          <Text testID="perf-runs">{runs.map((r, i) => `Run ${i + 1}: p50 ${r.p50.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms`).join('\n')}</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ block: { gap: space.cardPad / 2, paddingVertical: space.cardPad } });
