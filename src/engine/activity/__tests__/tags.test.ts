import fc from 'fast-check';
import { rowTag, type TagInput } from '../tags';

const T = '2026-10-09';
const base: TagInput = { status: 'paid', local_date: T, original_amount: -100, transfer_id: null };

describe('rowTag', () => {
  const cases: [string, Partial<TagInput>, string, string][] = [
    ['paid transfer', { transfer_id: 't' }, 'moved', 'neutral'],
    ['pending transfer', { transfer_id: 't', status: 'pending' }, 'scheduled', 'scheduled'],
    ['future transfer', { transfer_id: 't', local_date: '2026-10-10' }, 'scheduled', 'scheduled'],
    ['future income', { original_amount: 100, local_date: '2026-10-10', status: 'pending' }, 'scheduled', 'scheduled'],
    ['overdue expense', { status: 'pending', local_date: '2026-10-01' }, 'overdue', 'unpaid'],
    ['due expense', { status: 'pending' }, 'due', 'unpaid'],
    ['pending refund today', { status: 'pending', original_amount: 50, is_refund: true }, 'due', 'unpaid'],
    ['expected income', { status: 'pending', original_amount: 100 }, 'expected', 'unpaid'],
    ['paid expense', {}, 'paid', 'paid'],
    ['paid income', { original_amount: 100 }, 'received', 'paid'],
    ['paid refund', { original_amount: 100, is_refund: true }, 'paid', 'paid'],
    ['skipped', { status: 'skipped' }, 'skipped', 'neutral'],
  ];
  it.each(cases)('%s', (_n, over, kind, tone) => {
    const t = rowTag({ ...base, ...over }, T);
    expect(t.kind).toBe(kind);
    expect(t.tone).toBe(tone);
  });

  it('flags refund', () => {
    expect(rowTag({ ...base, is_refund: true }, T).refund).toBe(true);
    expect(rowTag(base, T).refund).toBe(false);
  });

  it('rejects invalid dates', () => {
    expect(() => rowTag({ ...base, local_date: 'x' }, T)).toThrow(RangeError);
    expect(() => rowTag(base, 'x')).toThrow(RangeError);
  });

  it('a transfer never yields paid or received', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('pending' as const, 'paid' as const, 'skipped' as const),
        fc.constantFrom('2026-10-01', T, '2026-10-20'),
        fc.integer({ min: -1000, max: 1000 }),
        (status, local_date, original_amount) => {
          const k = rowTag({ status, local_date, original_amount, transfer_id: 't' }, T).kind;
          expect(['paid', 'received']).not.toContain(k);
        }
      )
    );
  });
});
