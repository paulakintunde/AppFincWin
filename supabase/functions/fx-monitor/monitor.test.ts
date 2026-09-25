import {
  findStale,
  buildDigest,
  runFxMonitor,
  STALENESS_DEFAULT_DAYS,
  type MonitorDeps,
  type UnsentAlert,
} from './monitor';

describe('STALENESS_DEFAULT_DAYS', () => {
  it('is 4 (about 4 calendar days, D-10)', () => {
    expect(STALENESS_DEFAULT_DAYS).toBe(4);
  });
});

describe('findStale', () => {
  const TODAY = '2026-09-29';

  it('is not stale exactly at the 4-day default limit', () => {
    const result = findStale([{ quote: 'USD', rate_date: '2026-09-25' }], [], TODAY);
    expect(result).toEqual([]);
  });

  it('is stale one day past the 4-day default limit', () => {
    const result = findStale([{ quote: 'USD', rate_date: '2026-09-24' }], [], TODAY);
    expect(result).toEqual([{ quote: 'USD', rateDate: '2026-09-24', ageDays: 5, limitDays: 4 }]);
  });

  it('uses a per-currency staleness_limit_days override', () => {
    const result = findStale(
      [{ quote: 'ARS', rate_date: '2026-09-26' }],
      [{ code: 'ARS', end_date: null, staleness_limit_days: 2 }],
      TODAY
    );
    expect(result).toEqual([{ quote: 'ARS', rateDate: '2026-09-26', ageDays: 3, limitDays: 2 }]);
  });

  it('ignores a currency with an end_date, however stale', () => {
    const result = findStale(
      [{ quote: 'VEF', rate_date: '2020-01-01' }],
      [{ code: 'VEF', end_date: '2021-01-01', staleness_limit_days: null }],
      TODAY
    );
    expect(result).toEqual([]);
  });

  it('uses the global default when the quote has no currencies row at all', () => {
    const result = findStale([{ quote: 'ZZZ', rate_date: '2026-09-20' }], [], TODAY);
    expect(result).toEqual([{ quote: 'ZZZ', rateDate: '2026-09-20', ageDays: 9, limitDays: 4 }]);
  });
});

describe('buildDigest', () => {
  it('groups alerts by kind with a count in the subject', () => {
    const alerts: UnsentAlert[] = [
      { id: 1, kind: 'stale', quote: 'ARS', detail: { ageDays: 6 }, created_at: '2026-09-29T00:00:00Z' },
      { id: 2, kind: 'stale', quote: 'TRY', detail: { ageDays: 5 }, created_at: '2026-09-29T00:00:00Z' },
      { id: 3, kind: 'held', quote: 'VEF', detail: { changeRatio: 0.5 }, created_at: '2026-09-29T00:00:00Z' },
      { id: 4, kind: 'auto-accepted', quote: 'NGN', detail: { heldRate: '1600' }, created_at: '2026-09-29T00:00:00Z' },
    ];

    const { subject, text } = buildDigest(alerts);

    expect(subject).toBe('FincWin FX: 2 stale, 1 held, 1 auto-accepted');
    expect(text).toContain('ARS');
    expect(text).toContain('TRY');
    expect(text).toContain('VEF');
    expect(text).toContain('NGN');
  });

  it('carries no user data -- only kind, quote and detail values reach the text', () => {
    const alerts: UnsentAlert[] = [
      { id: 1, kind: 'pending-rows', quote: null, detail: { count: 3 }, created_at: '2026-09-29T00:00:00Z' },
    ];
    const { text } = buildDigest(alerts);
    expect(text).toContain('pending-rows');
    expect(text).toContain('3');
  });
});

function makeDeps(overrides: Partial<MonitorDeps> = {}): MonitorDeps {
  return {
    today: () => '2026-09-29',
    latestRates: jest.fn(async () => []),
    currencies: jest.fn(async () => []),
    recentStaleAlerts: jest.fn(async () => []),
    insertAlerts: jest.fn(async () => undefined),
    autoAcceptHolds: jest.fn(async () => 0),
    restampPending: jest.fn(async () => 0),
    pendingRowsCount: jest.fn(async () => 0),
    unsentAlerts: jest.fn(async () => []),
    markEmailed: jest.fn(async () => undefined),
    sendEmail: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('runFxMonitor', () => {
  it('inserts a stale alert for every stale currency found', async () => {
    const insertAlerts = jest.fn(async () => undefined);
    const deps = makeDeps({
      latestRates: jest.fn(async () => [{ quote: 'ARS', rate_date: '2026-09-20' }]),
      insertAlerts,
    });

    await runFxMonitor(deps);

    expect(insertAlerts).toHaveBeenCalledWith([
      { kind: 'stale', quote: 'ARS', detail: { rateDate: '2026-09-20', ageDays: 9, limitDays: 4 } },
    ]);
  });

  it('does not repeat a stale alert while the same stale rate persists, but alerts again for a new stale episode (IN-B04)', async () => {
    const insertAlerts = jest.fn(async () => undefined);
    const deps = makeDeps({
      latestRates: jest.fn(async () => [
        { quote: 'ARS', rate_date: '2026-09-20' }, // already alerted for this rate_date
        { quote: 'TRY', rate_date: '2026-09-22' }, // alerted before, but for an older rate_date
      ]),
      recentStaleAlerts: jest.fn(async () => [
        { quote: 'ARS', rateDate: '2026-09-20' },
        { quote: 'TRY', rateDate: '2026-09-01' },
      ]),
      insertAlerts,
    });

    const result = await runFxMonitor(deps);

    expect(insertAlerts).toHaveBeenCalledWith([
      { kind: 'stale', quote: 'TRY', detail: { rateDate: '2026-09-22', ageDays: 7, limitDays: 4 } },
    ]);
    expect(result.stale).toBe(2);
  });

  it('calls auto-accept and reports its count', async () => {
    const autoAcceptHolds = jest.fn(async () => 2);
    const deps = makeDeps({ autoAcceptHolds });

    const result = await runFxMonitor(deps);

    expect(autoAcceptHolds).toHaveBeenCalled();
    expect(result.autoAccepted).toBe(2);
  });

  it('re-stamps due pending rows before counting the ones still stuck (WR-B01)', async () => {
    const order: string[] = [];
    const restampPending = jest.fn(async () => {
      order.push('restamp');
      return 4;
    });
    const pendingRowsCount = jest.fn(async () => {
      order.push('count');
      return 1;
    });
    const deps = makeDeps({ restampPending, pendingRowsCount });

    const result = await runFxMonitor(deps);

    expect(order).toEqual(['restamp', 'count']);
    expect(result.restamped).toBe(4);
  });

  it('inserts one pending-rows alert only when the count is greater than zero', async () => {
    const insertAlerts = jest.fn(async () => undefined);
    const deps = makeDeps({ pendingRowsCount: jest.fn(async () => 3), insertAlerts });

    await runFxMonitor(deps);

    expect(insertAlerts).toHaveBeenCalledWith([{ kind: 'pending-rows', detail: { count: 3 } }]);
  });

  it('does not insert a pending-rows alert when the count is zero', async () => {
    const insertAlerts = jest.fn(async () => undefined);
    const deps = makeDeps({ pendingRowsCount: jest.fn(async () => 0), insertAlerts });

    await runFxMonitor(deps);

    expect(insertAlerts).not.toHaveBeenCalled();
  });

  it('emails every unsent alert in one Resend call and marks them emailed', async () => {
    const unsent: UnsentAlert[] = [
      { id: 10, kind: 'stale', quote: 'ARS', detail: {}, created_at: '2026-09-29T00:00:00Z' },
      { id: 11, kind: 'held', quote: 'VEF', detail: {}, created_at: '2026-09-29T00:00:00Z' },
    ];
    const sendEmail = jest.fn(async () => undefined);
    const markEmailed = jest.fn(async () => undefined);
    const deps = makeDeps({ unsentAlerts: jest.fn(async () => unsent), sendEmail, markEmailed });

    const result = await runFxMonitor(deps);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith('FincWin FX: 1 stale, 1 held', expect.any(String));
    expect(markEmailed).toHaveBeenCalledWith([10, 11]);
    expect(result.emailed).toBe(2);
  });

  it('sends a daily all-clear heartbeat when there are no unsent alerts, so a missing email means fx-monitor failed (IN-B03)', async () => {
    const sendEmail = jest.fn(async () => undefined);
    const markEmailed = jest.fn(async () => undefined);
    const deps = makeDeps({
      unsentAlerts: jest.fn(async () => []),
      restampPending: jest.fn(async () => 2),
      sendEmail,
      markEmailed,
    });

    const result = await runFxMonitor(deps);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith('FincWin FX: all clear', expect.stringContaining('2026-09-29'));
    expect(markEmailed).not.toHaveBeenCalled();
    expect(result.emailed).toBe(0);
  });

  it('rejects and never marks alerts emailed when Resend returns a non-2xx', async () => {
    const unsent: UnsentAlert[] = [
      { id: 10, kind: 'stale', quote: 'ARS', detail: {}, created_at: '2026-09-29T00:00:00Z' },
    ];
    const sendEmail = jest.fn(async () => {
      throw new Error('resend 500');
    });
    const markEmailed = jest.fn(async () => undefined);
    const deps = makeDeps({ unsentAlerts: jest.fn(async () => unsent), sendEmail, markEmailed });

    await expect(runFxMonitor(deps)).rejects.toThrow('resend 500');
    expect(markEmailed).not.toHaveBeenCalled();
  });
});
