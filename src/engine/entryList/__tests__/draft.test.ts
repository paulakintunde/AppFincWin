import fc from 'fast-check';
import { ENTRY_DRAFT_VERSION, dropUnavailable, parseDraft, serialiseDraft } from '../draft';
import type { ListItem } from '../model';
import { mk, mkTransfer } from './fixtures';

const AT = '2026-10-12T10:00:00.000Z';
const raw = (items: unknown, v: unknown = 1) => JSON.stringify({ v, savedAt: AT, items });

describe('parseDraft', () => {
  it('round-trips', () => {
    expect(ENTRY_DRAFT_VERSION).toBe(1);
    const items = [
      mk({ repeat: { freq: 'monthly', end: { kind: 'count', count: 12 } }, categoryId: 'c', paymentType: 'card', note: 'x' }),
      mk({ repeat: { freq: 'weekly', end: { kind: 'date', date: '2026-10-12' } } }),
      mk({ type: 'in', status: 'pending', automatic: true }),
      mkTransfer({ toCurrency: 'EUR', amountInMinor: 1150 }),
    ];
    expect(parseDraft(serialiseDraft(items, AT))).toEqual(items);
  });
  it('discards unusable input', () => {
    expect(parseDraft(null)).toEqual([]);
    expect(parseDraft('{nope')).toEqual([]);
    expect(parseDraft('5')).toEqual([]);
    expect(parseDraft('null')).toEqual([]);
    expect(parseDraft(raw([mk()], 2))).toEqual([]);
    expect(parseDraft(raw({}))).toEqual([]);
    expect(parseDraft(raw([null]))).toEqual([]);
    expect(parseDraft(raw([]))).toEqual([]);
  });

  const bad: Array<[string, Record<string, unknown>]> = [
    ['float amount', { amountMinor: 10.5 }],
    ['zero amount', { amountMinor: 0 }],
    ['negative amount', { amountMinor: -5 }],
    ['huge amount', { amountMinor: 1e13 + 1 }],
    ['string amount', { amountMinor: '5' }],
    ['bad date', { localDate: '2026-02-30' }],
    ['non-string date', { localDate: 5 }],
    ['unknown type', { type: 'swap' }],
    ['unknown status', { status: 'done' }],
    ['non-string id', { id: 1 }],
    ['non-string name', { name: null }],
    ['non-boolean flag', { automatic: 'no' }],
    ['non-string categoryId', { categoryId: 4 }],
    ['non-string paymentType', { paymentType: 4 }],
    ['bad repeat shape', { repeat: 'monthly' }],
    ['null repeat', { repeat: null }],
    ['bad freq', { repeat: { freq: 'daily', end: { kind: 'never' } } }],
    ['missing end', { repeat: { freq: 'monthly' } }],
    ['bad end kind', { repeat: { freq: 'monthly', end: { kind: 'x' } } }],
    ['count zero', { repeat: { freq: 'monthly', end: { kind: 'count', count: 0 } } }],
    ['count 1001', { repeat: { freq: 'monthly', end: { kind: 'count', count: 1001 } } }],
    ['count float', { repeat: { freq: 'monthly', end: { kind: 'count', count: 1.5 } } }],
    ['end before item', { repeat: { freq: 'monthly', end: { kind: 'date', date: '2026-10-11' } } }],
    ['end invalid', { repeat: { freq: 'monthly', end: { kind: 'date', date: 'soon' } } }],
    ['end non-string', { repeat: { freq: 'monthly', end: { kind: 'date', date: 3 } } }],
    ['out with toAccountId', { toAccountId: 'a2' }],
    ['bad amountInMinor', { amountInMinor: 1.5 }],
    ['bad toCurrency', { toCurrency: 4 }],
    ['bad accountId', { accountId: null }],
    ['bad currency', { currency: 3 }],
  ];
  it.each(bad)('discards the whole draft on %s', (_n, over) => {
    expect(parseDraft(raw([mk(), { ...mk(), ...over }]))).toEqual([]);
  });
  it('rejects transfer without toAccountId or with a repeat', () => {
    expect(parseDraft(raw([mkTransfer({ toAccountId: null })]))).toEqual([]);
    expect(parseDraft(raw([mkTransfer({ repeat: { freq: 'monthly', end: { kind: 'never' } } })]))).toEqual([]);
  });
  it('rejects 31 of one type, accepts 30 of each', () => {
    expect(parseDraft(raw(Array.from({ length: 31 }, () => mk())))).toEqual([]);
    const ok = [
      ...Array.from({ length: 30 }, () => mk()),
      ...Array.from({ length: 30 }, () => mk({ type: 'in' })),
      ...Array.from({ length: 30 }, () => mkTransfer()),
    ];
    expect(parseDraft(raw(ok))).toHaveLength(90);
  });
  it('rejects a missing field entirely', () => {
    const rest: Record<string, unknown> = { ...mk() };
    delete rest.note;
    expect(parseDraft(raw([rest]))).toEqual([]);
  });
});

describe('dropUnavailable', () => {
  it('keeps items whose accounts exist and counts the rest', () => {
    const a = mk({ accountId: 'a1' });
    const b = mk({ accountId: 'gone' });
    const t1 = mkTransfer({ accountId: 'a1', toAccountId: 'a2' });
    const t2 = mkTransfer({ accountId: 'a1', toAccountId: 'gone' });
    expect(dropUnavailable([a, b, t1, t2], new Set(['a1', 'a2']))).toEqual({ items: [a, t1], dropped: 2 });
  });
});

describe('property', () => {
  const date = fc
    .integer({ min: 0, max: 3000 })
    .map((d) => new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10));
  const repeat = fc.oneof(
    fc.constant({ freq: 'never' as const }),
    fc.record({
      freq: fc.constantFrom('weekly' as const, 'fortnightly' as const, 'monthly' as const, 'quarterly' as const, 'yearly' as const),
      end: fc.oneof(
        fc.constant({ kind: 'never' as const }),
        fc.record({ kind: fc.constant('count' as const), count: fc.integer({ min: 1, max: 1000 }) }),
      ),
    }),
  );
  const item = fc
    .record({
      type: fc.constantFrom('out' as const, 'in' as const),
      amountMinor: fc.integer({ min: 1, max: 10_000_000_000_000 }),
      localDate: date,
      name: fc.string(),
      note: fc.string(),
      repeat,
      status: fc.constantFrom('paid' as const, 'pending' as const),
    })
    .map((o) => mk(o as Partial<ListItem>));
  it('serialise then parse is identity for valid lists', () => {
    fc.assert(
      fc.property(fc.array(item, { maxLength: 30 }), (items) => {
        expect(parseDraft(serialiseDraft(items, AT))).toEqual(items);
      }),
    );
  });
});
