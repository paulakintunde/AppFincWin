import {
  LIST_CAP_PER_TYPE,
  addItem,
  canAdd,
  countByType,
  removeItem,
  repeatToSchedule,
  saveCount,
  summarise,
  takeItem,
} from '../model';
import { mk, mkTransfer } from './fixtures';

const many = (n: number) => Array.from({ length: n }, () => mk());

describe('caps', () => {
  it('is 30 and counts by type', () => {
    expect(LIST_CAP_PER_TYPE).toBe(30);
    expect(countByType([])).toEqual({ out: 0, in: 0, transfer: 0 });
    expect(countByType([mk(), mk({ type: 'in' }), mkTransfer(), mk()])).toEqual({ out: 2, in: 1, transfer: 1 });
  });
  it('refuses a 31st of a type but accepts other types', () => {
    const full = many(30);
    expect(canAdd(full, 'out')).toBe(false);
    expect(canAdd(full, 'in')).toBe(true);
    expect(addItem(full, mk())).toEqual({ ok: false, reason: 'cap' });
    expect(addItem(full, mk({ type: 'in' })).ok).toBe(true);
  });
  it('adds newest first and counts a repeating item once', () => {
    const a = mk();
    const b = mk({ repeat: { freq: 'monthly', end: { kind: 'never' } } });
    const r = addItem([a], b);
    expect(r.ok && r.items).toEqual([b, a]);
    expect(countByType([b]).out).toBe(1);
  });
  it('removes and takes by id', () => {
    const a = mk();
    const b = mk();
    expect(removeItem([a, b], a.id)).toEqual([b]);
    expect(removeItem([a, b], 'zzz')).toEqual([a, b]);
    expect(takeItem([a, b], b.id)).toEqual({ item: b, rest: [a] });
    expect(takeItem([a, b], 'zzz')).toBeNull();
  });
});

describe('summarise', () => {
  it('empty', () => expect(summarise([])).toEqual({ count: 0, kind: 'empty' }));
  it('single currency one direction', () => {
    const items = [1000, 2500, 10750].map((amountMinor) => mk({ amountMinor }));
    expect(summarise(items)).toEqual({ kind: 'single', count: 3, currency: 'GBP', direction: 'out', total: 14250 });
  });
  it('single direction in', () => {
    expect(summarise([mk({ type: 'in', amountMinor: 700 })])).toEqual({
      kind: 'single', count: 1, currency: 'GBP', direction: 'in', total: 700,
    });
  });
  it('split both directions; refund counts as in', () => {
    expect(summarise([mk({ amountMinor: 1000 }), mk({ type: 'in', amountMinor: 500 })])).toEqual({
      kind: 'split', count: 2, currency: 'GBP', outTotal: 1000, inTotal: 500,
    });
    expect(summarise([mk({ amountMinor: 1000 }), mk({ refund: true, amountMinor: 200 })])).toEqual({
      kind: 'split', count: 2, currency: 'GBP', outTotal: 1000, inTotal: 200,
    });
  });
  it('mixed currencies is count only', () => {
    expect(summarise([mk(), mk({ currency: 'EUR' })])).toEqual({ kind: 'count-only', count: 2 });
  });
  it('transfers only is count only; mixed ignores them in totals', () => {
    expect(summarise([mkTransfer(), mkTransfer()])).toEqual({ kind: 'count-only', count: 2 });
    expect(summarise([mkTransfer(), mk({ amountMinor: 300 })])).toEqual({
      kind: 'single', count: 2, currency: 'GBP', direction: 'out', total: 300,
    });
  });
});

describe('saveCount / repeatToSchedule', () => {
  it('adds the form row when it has an amount', () => {
    expect(saveCount([mk(), mk()], true)).toBe(3);
    expect(saveCount([mk(), mk()], false)).toBe(2);
  });
  it('maps repeats', () => {
    expect(repeatToSchedule({ freq: 'never' })).toBeNull();
    expect(repeatToSchedule({ freq: 'monthly', end: { kind: 'never' } })).toEqual({
      freq: 'monthly', endDate: null, occurrenceCount: null,
    });
    expect(repeatToSchedule({ freq: 'weekly', end: { kind: 'date', date: '2027-01-01' } })).toEqual({
      freq: 'weekly', endDate: '2027-01-01', occurrenceCount: null,
    });
    expect(repeatToSchedule({ freq: 'yearly', end: { kind: 'count', count: 5 } })).toEqual({
      freq: 'yearly', endDate: null, occurrenceCount: 5,
    });
  });
});
