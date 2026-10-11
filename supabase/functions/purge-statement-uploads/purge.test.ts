import { runPurge, type PurgeDeps } from './purge';

const names = (from: number, to: number) =>
  Array.from(
    { length: to - from + 1 },
    (_, i) => `aaaaaaaa-0000-0000-0000-${String(from + i).padStart(12, '0')}/f${from + i}.pdf`,
  );

function deps(over: Partial<PurgeDeps> = {}) {
  const logs: string[] = [];
  const d: PurgeDeps = {
    listStale: jest.fn().mockResolvedValue([]),
    remove: jest.fn(async (n: string[]) => n.length),
    now: jest.fn().mockReturnValueOnce(1000).mockReturnValue(1042),
    log: (l) => logs.push(l),
    ...over,
  };
  return { d, logs };
}

describe('runPurge', () => {
  it('removes two batches', async () => {
    const list = jest.fn().mockResolvedValueOnce(names(1, 100)).mockResolvedValueOnce(names(101, 120));
    const { d } = deps({ listStale: list });
    await expect(runPurge(d)).resolves.toEqual({ ok: true, removed: 120, batches: 2 });
    expect((d.remove as jest.Mock).mock.calls.map((c) => c[0].length)).toEqual([100, 20]);
  });

  it('does nothing when empty', async () => {
    const { d } = deps();
    await expect(runPurge(d)).resolves.toEqual({ ok: true, removed: 0, batches: 0 });
    expect(d.remove).not.toHaveBeenCalled();
  });

  it('stops after 10 batches', async () => {
    const { d } = deps({ listStale: jest.fn().mockResolvedValue(names(1, 100)) });
    await expect(runPurge(d)).resolves.toEqual({ ok: true, removed: 1000, batches: 10 });
  });

  it('never echoes a thrown message', async () => {
    const { d, logs } = deps({
      listStale: jest.fn().mockResolvedValue(names(1, 3)),
      remove: jest.fn().mockRejectedValue(new Error('secret-path/aaaaaaaa.pdf')),
    });
    const r = await runPurge(d);
    expect(r).toEqual({ ok: false, error: 'storage' });
    expect(JSON.stringify(r) + logs.join()).not.toContain('secret-path');
  });

  it('logs only counts, never names', async () => {
    const list = jest.fn().mockResolvedValueOnce(names(1, 5)).mockResolvedValue([]);
    const { d, logs } = deps({ listStale: list });
    await runPurge(d);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]);
    expect(Object.keys(parsed).sort()).toEqual(['batches', 'durationMs', 'fn', 'outcome', 'removed']);
    expect(logs[0]).not.toMatch(/aaaaaaaa|\.pdf/);
  });
});
