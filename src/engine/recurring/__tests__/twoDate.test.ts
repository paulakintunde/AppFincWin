import { INTERVAL_WINDOWS } from '../detect';
import { twoDateClusters } from '../twoDate';

describe('twoDateClusters', () => {
  it('returns null when a cluster is not monthly', () => {
    const dates = ['2026-01-01', '2026-02-01', '2026-04-01', '2026-01-15', '2026-02-15', '2026-03-15'];
    expect(twoDateClusters(dates)).toBeNull();
  });

  it('splits 1st and 15th', () => {
    const dates = ['2026-01-01', '2026-01-15', '2026-02-01', '2026-02-15', '2026-03-01', '2026-03-15'];
    const c = twoDateClusters(dates);
    expect(c?.days).toEqual([1, 15]);
    expect(c?.members[0]).toHaveLength(3);
  });

  it('returns null for a single day', () => {
    expect(twoDateClusters(['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05'])).toBeNull();
  });

  it('returns null when the centres are under 10 days apart', () => {
    expect(twoDateClusters(['2026-01-01', '2026-01-07', '2026-02-01', '2026-02-07', '2026-03-01', '2026-03-07'])).toBeNull();
  });

  it('tolerates a payday landing on the 30th for the 1st (month-end wrap)', () => {
    const dates = ['2026-01-30', '2026-01-15', '2026-03-01', '2026-02-15', '2026-04-01', '2026-03-15'];
    const c = twoDateClusters(dates);
    expect(c).not.toBeNull();
    expect(c?.members[1]).toHaveLength(3);
  });

  it('returns null when a day sits too far from its cluster centre', () => {
    const dates = ['2026-01-01', '2026-02-01', '2026-03-09', '2026-01-20', '2026-02-20', '2026-03-20'];
    expect(twoDateClusters(dates)).toBeNull();
  });

  it('the monthly gap window is Activity\'s, and the windows never overlap', () => {
    const windows = Object.values(INTERVAL_WINDOWS);
    for (const [lo, hi] of windows) expect(lo).toBeLessThanOrEqual(hi);
    for (let i = 1; i < windows.length; i += 1) expect(windows[i]![0]).toBeGreaterThan(windows[i - 1]![1]);
  });
});
