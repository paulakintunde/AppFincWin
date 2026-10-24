import type { SyncStatus } from '@/data/sync/useSyncStatus';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import type { SnapshotResult } from '../../snapshot/types';
import { CARD_CHOICE, META, TODAY, loggedSource, noneSource, roughSource, unconvertedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { homeProblems, noticeRowModel, type HomeProblemsInput } from '../homeProblems';

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);

const QUIET: SyncStatus = { isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: NOW, oldestPendingAt: null, inFlightOldestAt: null };

function input(over: Partial<HomeProblemsInput> = {}): HomeProblemsInput {
  return { source: loggedSource(), openChecks: [], sync: QUIET, today: TODAY, now: NOW, ...over };
}

const ids = (i: HomeProblemsInput) => homeProblems(i).map((e) => (e.id === 'missing_rate' ? `missing_rate:${e.variant}` : e.id));

/** A logged source with every R17.5 problem except the card-covered ones. */
function withMeta(over: Partial<SnapshotResult['meta']>, rest: Partial<SnapshotResult> = {}): SnapshotResult {
  const base = loggedSource();
  return { ...base, ...rest, meta: { ...META, ...over } } as SnapshotResult;
}

describe('homeProblems', () => {
  it('D-96 problems are listed in the R17.5 order', () => {
    const stale = { currency: 'EUR', rateText: '1.0800000000', rateDate: '2026-08-01' };
    const source = withMeta(
      { cardsWithoutMinimum: 1, cardsWithoutMinimumIds: ['card-1'] },
      { cardMaxPurchase: null, conversions: [stale], unconverted: { currencies: ['GBP'], rowCount: 2 }, cards: [CARD_CHOICE] }
    );
    const checkInputs = { ...emptyCheckInputs('buy', TODAY), currency: 'JPY' };
    const entries = homeProblems({
      source,
      openChecks: [{ inputs: checkInputs, isSample: false }],
      sync: { ...QUIET, isOnline: false, queued: 3, failed: 2, conflicts: 1 },
      today: TODAY,
      now: NOW,
    });
    expect(entries.map((e) => (e.id === 'missing_rate' ? `missing_rate:${e.variant}` : e.id))).toEqual([
      'missing_rate:lines',
      'missing_rate:card_limit',
      'missing_rate:check',
      'failed_saves',
      'conflicts',
      'card_minimum',
      'stale_rate',
      'sync',
    ]);
    expect(entries.find((e) => e.id === 'failed_saves')).toMatchObject({ count: 2, action: { kind: 'review_changes' } });
    expect(entries.find((e) => e.id === 'conflicts')).toMatchObject({ count: 1, action: { kind: 'review_edits' } });
    expect(entries.find((e) => e.id === 'card_minimum')).toMatchObject({ accountId: 'card-1', action: { kind: 'card_minimum', accountId: 'card-1' } });
    expect(entries.find((e) => e.id === 'missing_rate' && e.variant === 'check')).toMatchObject({ currency: 'JPY', checkCount: 1, action: { kind: 'exchange_rates' } });
    expect(entries.find((e) => e.id === 'sync')).toMatchObject({ action: null });
  });

  it('D-96 the first-run entry comes first and takes the rough-figures action', () => {
    const entries = homeProblems(input({ source: noneSource(), sync: { ...QUIET, failed: 1 } }));
    expect(entries.map((e) => e.id)).toEqual(['no_figures', 'failed_saves']);
    expect(entries[0]).toMatchObject({ counted: false, action: { kind: 'add_rough' } });
  });

  it('D-96 problems the card shows are listed but not counted', () => {
    const missing = homeProblems(input({ source: unconvertedSource('logged') }));
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ id: 'missing_rate', variant: 'lines', currency: 'EUR', rowCount: 2, counted: false });
    expect(noticeRowModel(missing)).toEqual({ visible: false });

    // the card limit, a D-67 check, failed saves and the rest are counted
    const limit = homeProblems(input({ source: { ...loggedSource(), cardMaxPurchase: null } }));
    expect(limit).toEqual([expect.objectContaining({ variant: 'card_limit', counted: true })]);
    expect(noticeRowModel(limit)).toEqual({ visible: true, text: { kind: 'items', count: 1 }, dot: true });

    // an uncounted entry beside a counted one adds nothing to the count
    const both = homeProblems(input({ source: unconvertedSource('logged'), sync: { ...QUIET, failed: 2 } }));
    expect(both).toHaveLength(2);
    expect(noticeRowModel(both)).toEqual({ visible: true, text: { kind: 'items', count: 1 }, dot: true });
  });

  it('D-96 a first-run user sees no notice row', () => {
    const entries = homeProblems(input({ source: noneSource() }));
    expect(entries.map((e) => e.id)).toEqual(['no_figures']);
    expect(noticeRowModel(entries)).toEqual({ visible: false });
    expect(noticeRowModel(homeProblems(input({ source: roughSource() })))).toEqual({ visible: false });
    expect(noticeRowModel(homeProblems(input({ source: null })))).toEqual({ visible: false });
  });

  it('D-96 a rate older than 30 days is listed', () => {
    const rate = (rateDate: string) => ({ currency: 'EUR', rateText: '1.0800000000', rateDate });
    const stale = (rateDate: string) => homeProblems(input({ source: { ...loggedSource(), conversions: [rate(rateDate)] } })).filter((e) => e.id === 'stale_rate');

    expect(stale('2026-09-15')).toHaveLength(0); // exactly 30 days
    expect(stale('2026-09-14')).toEqual([expect.objectContaining({ currency: 'EUR', rateDate: '2026-09-14', counted: true, action: { kind: 'exchange_rates' } })]); // 31 days
    expect(stale('2026-10-15')).toHaveLength(0);
    expect(stale('2026-11-01')).toHaveLength(0); // dated ahead of today
    // across a month and a year boundary
    expect(homeProblems(input({ source: { ...loggedSource(), conversions: [rate('2025-12-31')] }, today: '2026-02-01' })).filter((e) => e.id === 'stale_rate')).toHaveLength(1);
    expect(homeProblems(input({ source: { ...loggedSource(), conversions: [rate('2025-12-31')] }, today: '2026-01-30' })).filter((e) => e.id === 'stale_rate')).toHaveLength(0);
  });

  it('D-96 a slow save shows its sync text without the dot', () => {
    const saving = homeProblems(input({ sync: { ...QUIET, queued: 1, inFlightOldestAt: NOW - 6000, oldestPendingAt: NOW - 6000 } }));
    expect(saving).toEqual([expect.objectContaining({ id: 'sync', label: { key: 'sync.saving' }, dot: false })]);
    expect(noticeRowModel(saving)).toEqual({ visible: true, text: { kind: 'sync', label: { key: 'sync.saving' } }, dot: false });

    const waiting = homeProblems(input({ sync: { ...QUIET, queued: 2, oldestPendingAt: NOW - 9000 } }));
    expect(noticeRowModel(waiting)).toEqual({ visible: true, text: { kind: 'sync', label: { key: 'sync.waiting', count: 2 } }, dot: false });

    // a young write says nothing
    expect(homeProblems(input({ sync: { ...QUIET, queued: 1, inFlightOldestAt: NOW - 1000, oldestPendingAt: NOW - 1000 } }))).toEqual([]);
  });

  it('D-96 offline shows its own text, with the dot only when writes wait', () => {
    const offline = homeProblems(input({ sync: { ...QUIET, isOnline: false } }));
    expect(noticeRowModel(offline)).toEqual({ visible: true, text: { kind: 'sync', label: { key: 'sync.offline' } }, dot: false });

    const queued = homeProblems(input({ sync: { ...QUIET, isOnline: false, queued: 3 } }));
    expect(noticeRowModel(queued)).toEqual({ visible: true, text: { kind: 'sync', label: { key: 'sync.offlineWaiting', count: 3 } }, dot: true });
  });

  it('D-96 the sync text gives way to the count when another entry is counted', () => {
    const entries = homeProblems(input({ sync: { ...QUIET, isOnline: false, queued: 3, failed: 1 } }));
    expect(noticeRowModel(entries)).toEqual({ visible: true, text: { kind: 'items', count: 2 }, dot: true });
  });

  it('D-96 nothing wrong lists nothing and hides the row', () => {
    const entries = homeProblems(input());
    expect(entries).toEqual([]);
    expect(noticeRowModel(entries)).toEqual({ visible: false });
    expect(ids(input())).toEqual([]);
  });

  it('D-96 checks typed in the home currency or with a stored rate are not listed', () => {
    const home = { ...emptyCheckInputs('buy', TODAY), currency: 'USD' };
    expect(homeProblems(input({ openChecks: [{ inputs: home, isSample: false }] }))).toEqual([]);
    // an unstamped sample is USD (IN-A01)
    expect(homeProblems(input({ openChecks: [{ inputs: { ...emptyCheckInputs('buy', TODAY), currency: null }, isSample: true }] }))).toEqual([]);
  });
});
