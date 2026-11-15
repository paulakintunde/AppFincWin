import fc from 'fast-check';
import { reconcile, reconcileEvent } from '../reconcile';

describe('reconcile', () => {
  it('applies a newer event when nothing is queued', () => {
    expect(reconcile(5, 4, false)).toBe('apply');
  });
  it('applies an event for a row not in the cache', () => {
    expect(reconcile(1, undefined, false)).toBe('apply');
  });
  it('holds a newer event while a write is queued', () => {
    expect(reconcile(5, 4, true)).toBe('hold');
    expect(reconcile(1, undefined, true)).toBe('hold');
  });
  it('drops an own-write echo (equal version)', () => {
    expect(reconcile(4, 4, false)).toBe('drop');
    expect(reconcile(4, 4, true)).toBe('drop');
  });
  it('drops a stale event', () => {
    expect(reconcile(3, 4, false)).toBe('drop');
  });
});

describe('reconcileEvent', () => {
  const ev = { table: 'transactions', householdId: 'h1', id: 'r', version: 5 };
  it('drops events from another household', () => {
    expect(reconcileEvent(ev, 'h2', 1, false)).toBe('drop');
    expect(reconcileEvent(ev, null, 1, false)).toBe('drop');
  });
  it('delegates for the active household', () => {
    expect(reconcileEvent(ev, 'h1', 1, false)).toBe('apply');
    expect(reconcileEvent(ev, 'h1', 1, true)).toBe('hold');
    expect(reconcileEvent(ev, 'h1', 5, false)).toBe('drop');
  });
});

describe('reconcile properties', () => {
  it('without pending writes the cache never decreases and ends at the max version', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 40 }), (versions) => {
        let cache: number | undefined;
        for (const v of versions) {
          const before = cache;
          if (reconcile(v, cache, false) === 'apply') cache = v;
          if (before !== undefined) expect(cache as number).toBeGreaterThanOrEqual(before);
        }
        expect(cache).toBe(Math.max(...versions));
      })
    );
  });
  it('with a pending write the cache row is never modified', () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
        fc.array(fc.integer({ min: 1, max: 50 }), { maxLength: 40 }),
        (start, versions) => {
          let cache = start;
          for (const v of versions) {
            if (reconcile(v, cache, true) === 'apply') cache = v;
          }
          expect(cache).toBe(start);
        }
      )
    );
  });
});
