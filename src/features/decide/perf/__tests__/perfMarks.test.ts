import { renderHook } from '@testing-library/react-native';
import { PERF_WINDOW, perfDump, perfEnabled, perfMark, perfReport, perfReset, usePerfMount } from '../perfMarks';

const original = process.env.EXPO_PUBLIC_PERF;
let now = 0;

beforeEach(() => {
  perfReset();
  now = 0;
  jest.spyOn(performance, 'now').mockImplementation(() => now);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  if (original === undefined) delete process.env.EXPO_PUBLIC_PERF;
  else process.env.EXPO_PUBLIC_PERF = original;
});

function time(name: string, ms: number): void {
  perfMark(`${name}:start`);
  now += ms;
  perfMark(`${name}:end`);
}

describe('perfMarks', () => {
  it('D-88 the perf harness is off unless EXPO_PUBLIC_PERF=1', () => {
    delete process.env.EXPO_PUBLIC_PERF;
    expect(perfEnabled()).toBe(false);
    time('verdict', 10);
    expect(perfReport()).toEqual({});
    expect(console.log).not.toHaveBeenCalled();
    process.env.EXPO_PUBLIC_PERF = '0';
    expect(perfEnabled()).toBe(false);
    process.env.EXPO_PUBLIC_PERF = '1';
    // nothing was recorded while it was off
    expect(perfReport()).toEqual({});
  });

  it('reports the median and p95 of each name and logs only durations', () => {
    process.env.EXPO_PUBLIC_PERF = '1';
    for (let i = 1; i <= 20; i += 1) time('verdict', i);
    time('details', 100);
    time('details', 300);
    const report = perfReport();
    expect(report.verdict).toEqual({ count: 20, median: 10.5, p95: 19 });
    expect(report.details).toEqual({ count: 2, median: 200, p95: 300 });
    expect(console.log).toHaveBeenCalledWith('[perf]', JSON.stringify(report));
  });

  it('keeps the last 30 samples and an odd count has a middle sample', () => {
    process.env.EXPO_PUBLIC_PERF = '1';
    for (let i = 1; i <= PERF_WINDOW + 5; i += 1) time('e4', i);
    const stat = perfReport().e4!;
    expect(stat.count).toBe(PERF_WINDOW);
    expect(stat.median).toBe(20.5);
    time('odd', 4);
    perfReset();
    time('odd', 4);
    time('odd', 8);
    time('odd', 6);
    expect(perfReport().odd!.median).toBe(6);
  });

  it('ignores an end without a start and a mark that is neither', () => {
    process.env.EXPO_PUBLIC_PERF = '1';
    perfMark('verdict:end');
    perfMark('verdict');
    expect(perfReport()).toEqual({});
  });

  it('06.1-72 perfDump logs one PERF line per name, whole ms, and nothing while off', () => {
    delete process.env.EXPO_PUBLIC_PERF;
    time('answer.mount', 5);
    expect(perfDump()).toEqual([]);
    expect(console.log).not.toHaveBeenCalled();
    process.env.EXPO_PUBLIC_PERF = '1';
    time('step.mount', 10.4);
    time('step.mount', 20.6);
    time('answer.mount', 7);
    expect(perfDump()).toEqual(['PERF answer.mount median=7 p95=7 n=1', 'PERF step.mount median=16 p95=21 n=2']);
    expect(console.log).toHaveBeenCalledWith('PERF step.mount median=16 p95=21 n=2');
  });

  it('06.1-72 usePerfMount times the first mount once and is a no-op while off', async () => {
    process.env.EXPO_PUBLIC_PERF = '1';
    const { rerender, unmount } = await renderHook(() => {
      now += 3;
      usePerfMount('setupItem.mount');
    });
    await rerender({});
    await rerender({});
    await unmount();
    const stat = perfReport()['setupItem.mount']!;
    expect(stat.count).toBe(1);
    expect(stat.median).toBeGreaterThanOrEqual(0);
    delete process.env.EXPO_PUBLIC_PERF;
    perfReset();
    await (await renderHook(() => usePerfMount('setupItem.mount'))).unmount();
    process.env.EXPO_PUBLIC_PERF = '1';
    expect(perfReport()).toEqual({});
  });
});
