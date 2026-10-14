import fc from 'fast-check';
import {
  ENTRY_DRAFT_VERSION,
  dropUnavailable,
  draftEntryCount,
  parseDraft,
  parseEntryDraft,
  serialiseDraft,
  type DraftForm,
} from '../draft';
import type { ListItem } from '../model';
import { mk, mkTransfer } from './fixtures';

const AT = '2026-10-12T10:00:00.000Z';
const raw = (items: unknown, v: unknown = 2) => JSON.stringify({ v, savedAt: AT, items });

describe('parseDraft', () => {
  it('round-trips', () => {
    expect(ENTRY_DRAFT_VERSION).toBe(2);
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
    expect(parseDraft(raw([mk()], 3))).toEqual([]);
    expect(parseDraft(raw([mk()], '2'))).toEqual([]);
    expect(parseDraft(JSON.stringify({ savedAt: AT, items: [mk()] }))).toEqual([]);
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
  it('rejects a transfer with no destination currency or a missing/stray received amount', () => {
    expect(parseDraft(raw([mkTransfer({ toCurrency: null })]))).toEqual([]);
    expect(parseDraft(raw([mkTransfer({ toCurrency: 'EUR', amountInMinor: null })]))).toEqual([]);
    expect(parseDraft(raw([mkTransfer({ toCurrency: 'GBP', amountInMinor: 500 })]))).toEqual([]);
    expect(parseDraft(raw([mkTransfer({ toCurrency: 'EUR', amountInMinor: 1150 })]))).toHaveLength(1);
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

const FORM: DraftForm = {
  direction: 'out', amountText: '12.50', name: 'Coffee', categoryId: 'c1', accountId: 'a1', currency: 'GBP',
  localDate: '2026-10-12', status: 'paid', statusTouched: false, paymentType: 'card', note: 'n',
  toAccountId: null, toCurrency: null, amountInText: '', automatic: false, refund: false,
};

describe('draft v2 form snapshot', () => {
  it('writes version 2 with a null form by default and the form when given', () => {
    expect(JSON.parse(serialiseDraft([mk()], AT))).toMatchObject({ v: 2, form: null });
    expect(JSON.parse(serialiseDraft([mk()], AT, FORM))).toMatchObject({ v: 2, form: FORM });
  });
  it('round-trips items and form', () => {
    const items = [mk()];
    expect(parseEntryDraft(serialiseDraft(items, AT, FORM))).toEqual({ items, form: FORM });
    expect(parseDraft(serialiseDraft(items, AT, FORM))).toEqual(items);
  });
  it('parses a literal v1 payload as items with no form (Pitfall 12)', () => {
    const item = mk();
    const v1 = `{"v":1,"savedAt":"${AT}","items":${JSON.stringify([item])}}`;
    expect(parseEntryDraft(v1)).toEqual({ items: [item], form: null });
  });
  it('empty on bad version, bad json, non-record, bad item', () => {
    const empty = { items: [], form: null };
    expect(parseEntryDraft(null)).toEqual(empty);
    expect(parseEntryDraft('{x')).toEqual(empty);
    expect(parseEntryDraft(raw([mk()], 3))).toEqual(empty);
    expect(parseEntryDraft(raw([mk()], '2'))).toEqual(empty);
    expect(parseEntryDraft(JSON.stringify({ savedAt: AT, items: [] }))).toEqual(empty);
    expect(parseEntryDraft(JSON.stringify({ v: 2, savedAt: AT, items: [{ bad: 1 }], form: FORM }))).toEqual(empty);
    expect(
      parseEntryDraft(JSON.stringify({ v: 2, items: Array.from({ length: 31 }, () => mk()), form: FORM })),
    ).toEqual(empty);
  });
  it('a v1 payload ignores any form key', () => {
    expect(parseEntryDraft(JSON.stringify({ v: 1, items: [], form: FORM }))).toEqual({ items: [], form: null });
  });
  it('form-only draft survives', () => {
    expect(parseEntryDraft(JSON.stringify({ v: 2, items: [], form: FORM }))).toEqual({ items: [], form: FORM });
  });
  it('accepts a transfer form with nullable fields set', () => {
    const t: DraftForm = {
      ...FORM, direction: 'transfer', toAccountId: 'a2', toCurrency: 'EUR', paymentType: null, categoryId: null, accountId: null,
    };
    expect(parseEntryDraft(serialiseDraft([], AT, t)).form).toEqual(t);
  });

  const badForm: Array<[string, Record<string, unknown>]> = [
    ['unknown direction', { direction: 'swap' }],
    ['non-string amountText', { amountText: 5 }],
    ['long amountText', { amountText: '1'.repeat(33) }],
    ['non-string name', { name: null }],
    ['long name', { name: 'x'.repeat(501) }],
    ['non-string note', { note: 1 }],
    ['long note', { note: 'x'.repeat(501) }],
    ['bad localDate', { localDate: '2026-02-30' }],
    ['non-string localDate', { localDate: 5 }],
    ['empty currency', { currency: '' }],
    ['long currency', { currency: 'x'.repeat(13) }],
    ['non-string currency', { currency: 3 }],
    ['bad status', { status: 'done' }],
    ['non-boolean statusTouched', { statusTouched: 'no' }],
    ['non-boolean automatic', { automatic: 1 }],
    ['non-boolean refund', { refund: null }],
    ['numeric categoryId', { categoryId: 4 }],
    ['numeric accountId', { accountId: 4 }],
    ['numeric toAccountId', { toAccountId: 4 }],
    ['numeric toCurrency', { toCurrency: 4 }],
    ['numeric paymentType', { paymentType: 4 }],
    ['long paymentType', { paymentType: 'x'.repeat(33) }],
    ['non-string amountInText', { amountInText: 4 }],
    ['long amountInText', { amountInText: '1'.repeat(33) }],
    ['long categoryId', { categoryId: 'x'.repeat(65) }],
    ['13-char toCurrency (L7)', { toCurrency: 'x'.repeat(13) }],
  ];
  it.each(badForm)('drops only the form on %s', (_n, over) => {
    const items = [mk()];
    const text = JSON.stringify({ v: 2, savedAt: AT, items, form: { ...FORM, ...over } });
    expect(parseEntryDraft(text)).toEqual({ items, form: null });
  });
  it('drops a non-record or missing-field form', () => {
    expect(parseEntryDraft(JSON.stringify({ v: 2, items: [], form: 'x' }))).toEqual({ items: [], form: null });
    expect(parseEntryDraft(JSON.stringify({ v: 2, items: [], form: [FORM] }))).toEqual({ items: [], form: null });
    const rest: Record<string, unknown> = { ...FORM };
    delete rest.note;
    expect(parseEntryDraft(JSON.stringify({ v: 2, items: [], form: rest }))).toEqual({ items: [], form: null });
  });
  it('keeps a 3-letter toCurrency and coerces a skipped status to paid (L7, H4)', () => {
    expect(parseEntryDraft(serialiseDraft([], AT, { ...FORM, toCurrency: 'USD' })).form?.toCurrency).toBe('USD');
    expect(parseEntryDraft(serialiseDraft([], AT, { ...FORM, status: 'skipped' })).form).toEqual({ ...FORM, status: 'paid' });
  });
  describe('repeats (H1a)', () => {
    const formWith = (over: Record<string, unknown>) =>
      parseEntryDraft(JSON.stringify({ v: 2, savedAt: AT, items: [], form: { ...FORM, ...over } })).form;
    it('round-trips a valid repeat unchanged', () => {
      const repeats = { freq: 'monthly' as const, end: { kind: 'count' as const, count: 6 } };
      expect(parseEntryDraft(serialiseDraft([], AT, { ...FORM, repeats }))).toEqual({ items: [], form: { ...FORM, repeats } });
    });
    it('an older v2 form with no repeats key parses with repeats undefined', () => {
      const form = formWith({});
      expect(form).toEqual(FORM);
      expect(form?.repeats).toBeUndefined();
    });
    it('a bad repeat degrades to never and keeps every other field', () => {
      expect(formWith({ repeats: { freq: 'monthly', end: { kind: 'count', count: 0 } } })).toEqual({
        ...FORM, repeats: { freq: 'never' },
      });
      expect(formWith({ repeats: 'weekly' })).toEqual({ ...FORM, repeats: { freq: 'never' } });
    });
    it('an end date before the entry degrades to never', () => {
      expect(
        formWith({ localDate: '2026-02-01', repeats: { freq: 'weekly', end: { kind: 'date', date: '2026-01-01' } } }),
      ).toEqual({ ...FORM, localDate: '2026-02-01', repeats: { freq: 'never' } });
    });
    it('a transfer cannot repeat; a never repeat on a transfer is kept', () => {
      expect(formWith({ direction: 'transfer', repeats: { freq: 'monthly', end: { kind: 'never' } } })?.repeats).toEqual({
        freq: 'never',
      });
      expect(formWith({ direction: 'transfer', repeats: { freq: 'never' } })?.repeats).toEqual({ freq: 'never' });
    });
  });
  it('counts a form as one unsaved entry', () => {
    const a = mk();
    expect(draftEntryCount({ items: [a, a], form: null })).toBe(2);
    expect(draftEntryCount({ items: [], form: FORM })).toBe(1);
    expect(draftEntryCount({ items: [a], form: FORM })).toBe(2);
    expect(draftEntryCount({ items: [], form: null })).toBe(0);
  });
  it('property: form round-trips', () => {
    const idStr = fc.option(fc.string({ maxLength: 64 }), { nil: null });
    const dateArb = fc
      .integer({ min: 0, max: 3000 })
      .map((d) => new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10));
    const form = fc.record({
      direction: fc.constantFrom('out' as const, 'in' as const, 'transfer' as const),
      amountText: fc.string({ maxLength: 32 }),
      name: fc.string({ maxLength: 500 }),
      categoryId: idStr,
      accountId: idStr,
      currency: fc.string({ minLength: 1, maxLength: 12 }),
      localDate: dateArb,
      status: fc.constantFrom('paid' as const, 'pending' as const),
      statusTouched: fc.boolean(),
      paymentType: fc.option(fc.string({ maxLength: 32 }), { nil: null }),
      note: fc.string({ maxLength: 500 }),
      toAccountId: idStr,
      toCurrency: fc.option(fc.string({ maxLength: 12 }), { nil: null }),
      amountInText: fc.string({ maxLength: 32 }),
      automatic: fc.boolean(),
      refund: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(fc.constant(mk()), { maxLength: 5 }), form, (items, f) => {
        expect(parseEntryDraft(serialiseDraft(items, AT, f))).toEqual({ items, form: f });
      }),
    );
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
