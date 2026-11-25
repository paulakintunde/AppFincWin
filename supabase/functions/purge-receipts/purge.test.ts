import { runPurge, type PurgeDeps } from './purge';

const paths = (from: number, to: number) =>
  Array.from(
    { length: to - from + 1 },
    (_, i) => `aaaaaaaa-0000-0000-0000-000000000001/bbbbbbbb-0000-0000-0000-${String(from + i).padStart(12, '0')}/r${from + i}.jpg`,
  );

function deps(over: Partial<PurgeDeps> = {}) {
  const logs: string[] = [];
  const d: PurgeDeps = {
    listStale: jest.fn().mockResolvedValue([]),
    remove: jest.fn(async (n: string[]) => n.length),
    ack: jest.fn(async () => undefined),
    now: jest.fn().mockReturnValueOnce(1000).mockReturnValue(1042),
    log: (l) => logs.push(l),
    ...over,
  };
  return { d, logs };
}

describe('runPurge (receipts)', () => {
  it('removes two batches and acknowledges exactly each batch', async () => {
    const first = paths(1, 100);
    const second = paths(101, 120);
    const list = jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { d } = deps({ listStale: list });
    await expect(runPurge(d)).resolves.toEqual({ ok: true, removed: 120, batches: 2 });
    expect((d.remove as jest.Mock).mock.calls.map((c) => c[0].length)).toEqual([100, 20]);
    expect((d.ack as jest.Mock).mock.calls.map((c) => c[0])).toEqual([first, second]);
  });

  it('does nothing when empty', async () => {
    const { d } = deps();
    await expect(runPurge(d)).resolves.toEqual({ ok: true, removed: 0, batches: 0 });
    expect(d.remove).not.toHaveBeenCalled();
    expect(d.ack).not.toHaveBeenCalled();
  });

  it('stops after 10 batches', async () => {
    const { d } = deps({ listStale: jest.fn().mockResolvedValue(paths(1, 100)) });
    await expect(runPurge(d)).resolves.toEqual({ ok: true, removed: 1000, batches: 10 });
  });

  it('a failed remove stops the run and acknowledges nothing for that batch', async () => {
    const list = jest.fn().mockResolvedValueOnce(paths(1, 100)).mockResolvedValueOnce(paths(101, 103));
    const remove = jest.fn().mockResolvedValueOnce(100).mockRejectedValueOnce(new Error('secret-path/r.jpg'));
    const { d, logs } = deps({ listStale: list, remove });
    const r = await runPurge(d);
    expect(r).toEqual({ ok: false, error: 'storage' });
    expect((d.ack as jest.Mock).mock.calls).toHaveLength(1);
    expect(JSON.stringify(r) + logs.join()).not.toContain('secret-path');
    expect(JSON.parse(logs[0])).toMatchObject({ outcome: 'storage', removed: 100, batches: 1 });
  });

  it('a failed acknowledgement is a storage failure too', async () => {
    const { d } = deps({ listStale: jest.fn().mockResolvedValue(paths(1, 3)), ack: jest.fn().mockRejectedValue(new Error('x')) });
    await expect(runPurge(d)).resolves.toEqual({ ok: false, error: 'storage' });
  });

  it('logs only counts: no path segment, no slash', async () => {
    const list = jest.fn().mockResolvedValueOnce(paths(1, 5)).mockResolvedValue([]);
    const { d, logs } = deps({ listStale: list });
    await runPurge(d);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]);
    expect(Object.keys(parsed).sort()).toEqual(['batches', 'durationMs', 'fn', 'outcome', 'removed']);
    expect(parsed.fn).toBe('purge-receipts');
    expect(logs[0]).not.toContain('/');
    expect(logs[0]).not.toMatch(/aaaaaaaa|\.jpg/);
  });
});
