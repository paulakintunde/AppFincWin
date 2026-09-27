import fc from 'fast-check';
import { NOW_SENTINEL, type PatchValue, type UndoEntity } from '../types';
import {
  buildStep,
  inverseOfImport,
  inverseOfInserts,
  inverseOfPatches,
  inverseOfSeriesChange,
  inverseOfSoftDeletes,
  planBulkPatch,
  type BulkPatchItem,
} from '../inverse';

describe('inverseOfInserts', () => {
  it('soft-deletes an inserted transaction', () => {
    expect(inverseOfInserts('transactions', [{ id: 'a', version: 1 }])).toEqual([
      { entity: 'transactions', id: 'a', expectedVersion: 1, patch: { deleted_at: NOW_SENTINEL } },
    ]);
  });

  it('soft-deletes an inserted recurring series row', () => {
    expect(inverseOfInserts('recurring_series', [{ id: 'a', version: 1 }])).toEqual([
      { entity: 'recurring_series', id: 'a', expectedVersion: 1, patch: { deleted_at: NOW_SENTINEL } },
    ]);
  });

  it('archives an inserted category', () => {
    expect(inverseOfInserts('categories', [{ id: 'c', version: 1 }])).toEqual([
      { entity: 'categories', id: 'c', expectedVersion: 1, patch: { archived_at: NOW_SENTINEL } },
    ]);
  });

  it('archives an inserted account', () => {
    expect(inverseOfInserts('accounts', [{ id: 'ac', version: 1 }])).toEqual([
      { entity: 'accounts', id: 'ac', expectedVersion: 1, patch: { archived_at: NOW_SENTINEL } },
    ]);
  });

  it('covers both legs of a transfer create in one op list (D-50)', () => {
    expect(
      inverseOfInserts('transactions', [
        { id: 'out', version: 1 },
        { id: 'in', version: 1 },
      ])
    ).toEqual([
      { entity: 'transactions', id: 'out', expectedVersion: 1, patch: { deleted_at: NOW_SENTINEL } },
      { entity: 'transactions', id: 'in', expectedVersion: 1, patch: { deleted_at: NOW_SENTINEL } },
    ]);
  });

  it('throws RangeError on a non-integer version', () => {
    expect(() => inverseOfInserts('transactions', [{ id: 'a', version: 1.5 }])).toThrow(RangeError);
  });

  it('throws RangeError on a version below 1', () => {
    expect(() => inverseOfInserts('transactions', [{ id: 'a', version: 0 }])).toThrow(RangeError);
  });

  it('throws via assertNever on an unrecognised entity', () => {
    expect(() => inverseOfInserts('unknown' as UndoEntity, [{ id: 'a', version: 1 }])).toThrow(
      /Unhandled UndoEntity/
    );
  });
});

describe('inverseOfSoftDeletes', () => {
  it('restores a soft-deleted transaction at its post-delete version', () => {
    expect(inverseOfSoftDeletes('transactions', [{ id: 'a', versionAfter: 4 }])).toEqual([
      { entity: 'transactions', id: 'a', expectedVersion: 4, patch: { deleted_at: null } },
    ]);
  });
});

describe('inverseOfPatches', () => {
  it('reverses a patch back to its before state, at the post-write version', () => {
    expect(
      inverseOfPatches('transactions', [
        { id: 'a', before: { status: 'pending', local_date: '2026-09-01' }, versionAfter: 3 },
      ])
    ).toEqual([
      {
        entity: 'transactions',
        id: 'a',
        expectedVersion: 3,
        patch: { status: 'pending', local_date: '2026-09-01' },
      },
    ]);
  });

  it('throws RangeError when before is empty', () => {
    expect(() => inverseOfPatches('transactions', [{ id: 'a', before: {}, versionAfter: 3 }])).toThrow(
      RangeError
    );
  });
});

describe('planBulkPatch', () => {
  it('builds a forward/inverse pair from the before snapshot', () => {
    const items: BulkPatchItem[] = [
      {
        entity: 'transactions',
        id: 'a',
        expectedVersion: 2,
        before: { status: 'pending' },
        patch: { status: 'paid' },
      },
    ];
    expect(planBulkPatch(items)).toEqual({
      forward: [{ entity: 'transactions', id: 'a', expectedVersion: 2, patch: { status: 'paid' } }],
      inverse: [{ entity: 'transactions', id: 'a', expectedVersion: 3, patch: { status: 'pending' } }],
    });
  });

  it('throws RangeError when before lacks a patched key', () => {
    const items: BulkPatchItem[] = [
      { entity: 'transactions', id: 'a', expectedVersion: 2, before: {}, patch: { status: 'paid' } },
    ];
    expect(() => planBulkPatch(items)).toThrow(RangeError);
  });

  it('throws RangeError on an empty forward patch', () => {
    const items: BulkPatchItem[] = [
      { entity: 'transactions', id: 'a', expectedVersion: 2, before: { status: 'pending' }, patch: {} },
    ];
    expect(() => planBulkPatch(items)).toThrow(RangeError);
  });

  it('property: inverse expectedVersion is forward + 1, with patch keys matching the forward op', () => {
    const keyArb = fc.constantFrom('status', 'note', 'category_id');
    const valueArb: fc.Arbitrary<PatchValue> = fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null));
    const itemArb: fc.Arbitrary<BulkPatchItem> = fc
      .tuple(fc.uuid(), fc.integer({ min: 1, max: 100_000 }), fc.array(keyArb, { minLength: 1, maxLength: 3 }), valueArb)
      .map(([id, expectedVersion, keys, value]) => {
        const patch: Record<string, PatchValue> = {};
        const before: Record<string, PatchValue> = {};
        for (const key of keys) {
          patch[key] = value;
          before[key] = value;
        }
        return { entity: 'transactions' as const, id, expectedVersion, before, patch };
      });

    fc.assert(
      fc.property(fc.array(itemArb, { minLength: 1, maxLength: 5 }), (items) => {
        const { forward, inverse } = planBulkPatch(items);
        items.forEach((item, i) => {
          expect(inverse[i]!.expectedVersion).toBe(item.expectedVersion + 1);
          expect(Object.keys(inverse[i]!.patch).sort()).toEqual(Object.keys(forward[i]!.patch).sort());
          expect(forward[i]!.expectedVersion).toBe(item.expectedVersion);
        });
      })
    );
  });
});

describe('inverseOfSeriesChange', () => {
  it('orders inserted-delete, then softDeleted-restore, then the series patch', () => {
    expect(
      inverseOfSeriesChange({
        series: { id: 's', versionAfter: 2, before: { amount: -1000 } },
        inserted: [{ id: 'n1', version: 1 }],
        softDeleted: [{ id: 'o1', versionAfter: 5 }],
        linked: [],
      })
    ).toEqual([
      { entity: 'transactions', id: 'n1', expectedVersion: 1, patch: { deleted_at: NOW_SENTINEL } },
      { entity: 'transactions', id: 'o1', expectedVersion: 5, patch: { deleted_at: null } },
      { entity: 'recurring_series', id: 's', expectedVersion: 2, patch: { amount: -1000 } },
    ]);
  });

  it('unlinks generated rows and deletes the series when it was created (before null)', () => {
    expect(
      inverseOfSeriesChange({
        series: { id: 's', versionAfter: 1, before: null },
        inserted: [],
        softDeleted: [],
        linked: [{ id: 't', versionAfter: 2 }],
      })
    ).toEqual([
      {
        entity: 'transactions',
        id: 't',
        expectedVersion: 2,
        patch: { recurring_series_id: null, occurrence_date: null },
      },
      { entity: 'recurring_series', id: 's', expectedVersion: 1, patch: { deleted_at: NOW_SENTINEL } },
    ]);
  });
});

describe('inverseOfImport', () => {
  it('drops the patch op for an imported row -- soft-delete alone reverses it', () => {
    const result = inverseOfImport({
      inserted: [
        { id: 'n1', version: 1 },
        { id: 'n2', version: 2 },
      ],
      patchInverse: [
        { entity: 'transactions', id: 'n2', expectedVersion: 2, patch: { transfer_id: null } },
        {
          entity: 'transactions',
          id: 's1',
          expectedVersion: 5,
          patch: { transfer_id: null, category_id: 'c-old' },
        },
        {
          entity: 'transactions',
          id: 'p1',
          expectedVersion: 3,
          patch: { status: 'pending', local_date: '2026-09-03', original_amount: -1099 },
        },
      ],
    });

    expect(result).toEqual([
      { entity: 'transactions', id: 'n1', expectedVersion: 1, patch: { deleted_at: NOW_SENTINEL } },
      { entity: 'transactions', id: 'n2', expectedVersion: 2, patch: { deleted_at: NOW_SENTINEL } },
      {
        entity: 'transactions',
        id: 's1',
        expectedVersion: 5,
        patch: { transfer_id: null, category_id: 'c-old' },
      },
      {
        entity: 'transactions',
        id: 'p1',
        expectedVersion: 3,
        patch: { status: 'pending', local_date: '2026-09-03', original_amount: -1099 },
      },
    ]);
  });

  it('throws RangeError when there is nothing to reverse', () => {
    expect(() => inverseOfImport({ inserted: [], patchInverse: [] })).toThrow(RangeError);
  });
});

describe('buildStep', () => {
  const op = (id: string) =>
    ({ entity: 'transactions' as const, id, expectedVersion: 1, patch: { deleted_at: NOW_SENTINEL } });

  it('builds a step with unique touchedIds in first-seen order', () => {
    const ops = [op('a'), op('b'), op('a')];
    expect(buildStep('step-1', 'deletedMany', { n: 30 }, ops)).toEqual({
      id: 'step-1',
      labelKey: 'deletedMany',
      labelParams: { n: 30 },
      ops,
      touchedIds: ['a', 'b'],
    });
  });

  it('throws RangeError on empty ops', () => {
    expect(() => buildStep('step-1', 'deletedMany', { n: 0 }, [])).toThrow(RangeError);
  });

  it('throws RangeError when ops exceeds MAX_UNDO_OPS', () => {
    const tooMany = Array.from({ length: 6001 }, (_, i) => op(`t${i}`));
    expect(() => buildStep('step-1', 'deletedMany', { n: 6001 }, tooMany)).toThrow(RangeError);
  });
});
