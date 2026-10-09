import fc from 'fast-check';
import { detectRecurring, type RecurringDetectRow, type RecurringSuggestion } from '../detect';
import { offerKey, selectOffers } from '../offer';

function row(id: string, localDate: string, name = 'Netflix ', amount = -1099): RecurringDetectRow {
  return { id, name, amount, currency: 'GBP', localDate };
}
const rows = [row('a', '2026-07-05'), row('b', '2026-08-05'), row('c', '2026-09-05')];
const dates = new Map(rows.map((r) => [r.id, r.localDate]));
const ctx = (over: Partial<Parameters<typeof selectOffers>[1]> = {}) => ({
  viewedMonth: '2026-09',
  dismissedKeys: new Set<string>(),
  seriesLinkedRowIds: new Set<string>(),
  rowDates: dates,
  ...over,
});

describe('offerKey', () => {
  it('matches the detector key', () => {
    const [s] = detectRecurring(rows);
    expect(s!.key).toBe(offerKey(rows[0]!.name, 'GBP', rows[0]!.amount));
  });
});

describe('selectOffers', () => {
  const detected = detectRecurring(rows);

  it('offers a monthly group in the viewed month', () => {
    const o = selectOffers(detected, ctx());
    expect(o).toHaveLength(1);
    expect(o[0]!.previousMonth).toBe('2026-08');
    expect(o[0]!.latestRowId).toBe('c');
  });

  it('drops dismissed keys, linked rows, other months and non-monthly', () => {
    expect(selectOffers(detected, ctx({ dismissedKeys: new Set([detected[0]!.key]) }))).toEqual([]);
    expect(selectOffers(detected, ctx({ seriesLinkedRowIds: new Set(['b']) }))).toEqual([]);
    expect(selectOffers(detected, ctx({ viewedMonth: '2026-10' }))).toEqual([]);
    const weekly: RecurringSuggestion = { ...detected[0]!, freq: 'weekly' };
    expect(selectOffers([weekly], ctx())).toEqual([]);
  });

  it('skips groups with fewer than two dated rows', () => {
    expect(selectOffers(detected, ctx({ rowDates: new Map([['c', '2026-09-05']]) }))).toEqual([]);
  });

  it('a dismissed group stays dismissed as rows join; a new key surfaces', () => {
    const more = [
      ...rows,
      row('d', '2026-10-05'),
      row('x', '2026-08-10', 'Spotify', -500),
      row('y', '2026-09-10', 'Spotify', -500),
      row('z', '2026-10-10', 'Spotify', -500),
    ];
    const d = detectRecurring(more);
    const dd = new Map(more.map((r) => [r.id, r.localDate]));
    const o = selectOffers(
      d,
      ctx({ viewedMonth: '2026-10', rowDates: dd, dismissedKeys: new Set([detected[0]!.key]) })
    );
    expect(o.map((x) => x.suggestion.name.trim())).toEqual(['Spotify']);
  });

  it('property: output excludes dismissed and is a subset of detected', () => {
    const many = [
      ...rows,
      row('x', '2026-07-10', 'Spotify', -500),
      row('y', '2026-08-10', 'Spotify', -500),
      row('z', '2026-09-10', 'Spotify', -500),
    ];
    const d = detectRecurring(many);
    const dd = new Map(many.map((r) => [r.id, r.localDate]));
    fc.assert(
      fc.property(fc.subarray(d.map((s) => s.key)), (dismissed) => {
        const out = selectOffers(d, ctx({ rowDates: dd, dismissedKeys: new Set(dismissed) }));
        return out.every((o) => !dismissed.includes(o.key) && d.some((s) => s.key === o.key));
      })
    );
  });
});
