import { PERF_WINDOW, perfEnabled, perfMark, perfReport, perfReset } from '../perfMarks';

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
});
