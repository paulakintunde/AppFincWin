// 06.1-73: the perf-only cache probe. A no-op unless EXPO_PUBLIC_PERF=1; with perf on it counts per key NAME only and logs
// `PERF probe <name> n=<count> ms=<total>` and `PERF idle_after_write ms=<ms>`.
import { QueryClient } from '@tanstack/react-query';
import {
  IDLE_QUIET_MS,
  probeCommit,
  probeDehydrate,
  probeReport,
  probeReset,
  probeSave,
  REPORT_EVERY_MS,
  startCacheProbe,
} from '../cacheProbe';

const original = process.env.EXPO_PUBLIC_PERF;

function logLines(spy: jest.SpyInstance): string[] {
  return spy.mock.calls.map((c) => String(c[0]));
}

describe('06.1-73 cache probe', () => {
  let log: jest.SpyInstance;
  beforeEach(() => {
    probeReset();
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    log.mockRestore();
    jest.useRealTimers();
    if (original === undefined) delete process.env.EXPO_PUBLIC_PERF;
    else process.env.EXPO_PUBLIC_PERF = original;
  });

  it('is a no-op with EXPO_PUBLIC_PERF unset', async () => {
    delete process.env.EXPO_PUBLIC_PERF;
    const qc = new QueryClient();
    const stop = startCacheProbe(qc);
    qc.setQueryData(['accounts', 'hh-1'], [1]);
    probeDehydrate(5, 10);
    probeSave(1, 2, 3, 4);
    probeCommit('tab.decide', 'update', 2);
    expect(probeReport()).toEqual({});
    stop();
    expect(log).not.toHaveBeenCalled();
  });

  it('counts events per key name only and prints the report lines', async () => {
    process.env.EXPO_PUBLIC_PERF = '1';
    const qc = new QueryClient();
    const stop = startCacheProbe(qc);
    qc.setQueryData(['accounts', 'secret-household'], [{ amount: 98765 }]);
    await qc.invalidateQueries({ queryKey: ['accounts'], refetchType: 'none' });
    await qc.fetchQuery({ queryKey: ['months', 'secret-household', 3], queryFn: async () => 1 });
    probeDehydrate(4, 120);
    probeSave(10, 200, 30, 900);
    probeCommit('tab.decide', 'update', 2.4);
    probeCommit('tab.decide', 'update', 1.2);
    const report = probeReport();
    stop();
    expect(report['q.added.accounts']?.n).toBe(1);
    expect(report['invalidate.accounts']?.n).toBe(1);
    expect(report['fetch.months']?.n).toBe(1);
    expect(report['persist.dehydrate']).toEqual({ n: 1, ms: 4 });
    expect(report['persist.encrypt']).toEqual({ n: 1, ms: 200 });
    expect(report['commit.tab.decide']).toEqual({ n: 2, ms: 4 });
    const lines = logLines(log);
    expect(lines).toContain('PERF probe persist.encrypt n=1 ms=200');
    for (const l of lines) expect(l).toMatch(/^PERF probe [a-z.A-Z0-9_-]+ n=\d+ ms=\d+$/);
    const all = lines.join('\n');
    expect(all).not.toContain('secret-household');
    expect(all).not.toContain('98765');
  });

  it('counts mutation events and logs idle_after_write once the caches are quiet', async () => {
    process.env.EXPO_PUBLIC_PERF = '1';
    jest.useFakeTimers();
    const qc = new QueryClient();
    const stop = startCacheProbe(qc);
    const m = qc.getMutationCache().build(qc, { mutationKey: ['decide-checks', 'save'], mutationFn: async () => 1 });
    await m.execute({ price: 1 });
    jest.advanceTimersByTime(1_000);
    qc.setQueryData(['decide-checks', 'x'], 1);
    jest.advanceTimersByTime(IDLE_QUIET_MS);
    const idle = logLines(log).filter((l) => l.startsWith('PERF idle_after_write'));
    expect(idle).toEqual(['PERF idle_after_write ms=1000']);
    // A later cache event with no write in between does not log again.
    qc.setQueryData(['decide-checks', 'x'], 2);
    jest.advanceTimersByTime(IDLE_QUIET_MS);
    expect(logLines(log).filter((l) => l.startsWith('PERF idle_after_write'))).toHaveLength(1);
    // The running probe reports every REPORT_EVERY_MS while counters change.
    jest.advanceTimersByTime(REPORT_EVERY_MS);
    expect(logLines(log).some((l) => l.startsWith('PERF probe m.success.decide-checks'))).toBe(true);
    stop();
  });

  it('ignores observer-only events for the per-key counts and stops cleanly', () => {
    process.env.EXPO_PUBLIC_PERF = '1';
    const qc = new QueryClient();
    const stop = startCacheProbe(qc);
    const observerUnsub = qc.getQueryCache().build(qc, { queryKey: ['k'] });
    expect(observerUnsub).toBeDefined();
    stop();
    qc.setQueryData(['after-stop'], 1);
    expect(probeReport()['q.added.after-stop']).toBeUndefined();
  });
});
