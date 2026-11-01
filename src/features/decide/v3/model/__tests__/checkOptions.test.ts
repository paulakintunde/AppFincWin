import { V3_ITEM_TYPES, type ItemTypeRef, type Purpose } from '@/engine/decide/v3';
import { ITEM_TYPE_ORDER, PURPOSE_ORDER, itemTypeOptions, purposeOptions, withJustAdded } from '../checkOptions';

describe('purposeOptions', () => {
  it('D-10 order is exact', () => {
    expect([...PURPOSE_ORDER]).toEqual(['invest_in_me', 'for_work', 'necessity', 'nice_to_have', 'treat', 'luxury']);
  });
  it('lists six presets, nothing selected by default', () => {
    const o = purposeOptions(null, []);
    expect(o.map((x) => x.labelKey)).toEqual(PURPOSE_ORDER.map((p) => `decide.v3.ui.layers.purpose.${p}`));
    expect(o.some((x) => x.selected)).toBe(false);
  });
  it('custom purposes follow in stored order and can be selected', () => {
    const sel: Purpose = { kind: 'custom', id: 'b' };
    const o = purposeOptions(sel, [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]);
    expect(o.slice(6).map((x) => [x.label, x.labelKey, x.selected])).toEqual([['A', null, false], ['B', null, true]]);
  });
  it('selects a preset', () => {
    const o = purposeOptions({ kind: 'preset', value: 'treat' }, []);
    expect(o.filter((x) => x.selected).map((x) => x.ref)).toEqual([{ kind: 'preset', value: 'treat' }]);
  });
});

describe('itemTypeOptions', () => {
  it('order is a subset of the engine types', () => {
    for (const t of ITEM_TYPE_ORDER) expect(V3_ITEM_TYPES as readonly string[]).toContain(t);
  });
  it('nine presets with general selected', () => {
    const o = itemTypeOptions({ kind: 'preset', value: 'general' }, []);
    expect(o).toHaveLength(9);
    expect(o.map((x) => x.ref)).toEqual(ITEM_TYPE_ORDER.map((value) => ({ kind: 'preset', value })));
    expect(o.filter((x) => x.selected).map((x) => x.labelKey)).toEqual(['decide.v3.ui.check.itemType.general']);
    expect(o.some((x) => x.readOnly)).toBe(false);
  });
  it('custom types follow the presets', () => {
    const sel: ItemTypeRef = { kind: 'custom', id: 'c1' };
    const o = itemTypeOptions(sel, [{ id: 'c1', label: 'Boat' }, { id: 'c2', label: 'Bike' }]);
    expect(o.slice(9).map((x) => [x.label, x.selected])).toEqual([['Boat', true], ['Bike', false]]);
  });
  it.each(['rent_bill', 'loan_repayment', 'cash_equivalent'] as const)('a stored %s is a read-only selected chip', (value) => {
    const o = itemTypeOptions({ kind: 'preset', value }, []);
    expect(o).toHaveLength(10);
    expect(o[9]).toMatchObject({ ref: { kind: 'preset', value }, selected: true, readOnly: true, labelKey: `decide.v3.ui.check.itemType.${value}` });
  });
});

describe('retired own options', () => {
  it('keeps a removed own kind visible, by stored name or the generic copy', () => {
    const sel: ItemTypeRef = { kind: 'custom', id: 'x' };
    expect(itemTypeOptions(sel, [], new Map([['x', 'Bike']])).at(-1)).toMatchObject({ label: 'Bike', labelKey: null, selected: true, readOnly: true });
    expect(itemTypeOptions(sel, []).at(-1)).toMatchObject({ label: null, labelKey: 'decide.v3.ui.ownOptions.removedName', readOnly: true });
  });
  it('keeps a removed own purpose visible, by stored name or the generic copy', () => {
    const sel: Purpose = { kind: 'custom', id: 'p' };
    expect(purposeOptions(sel, [], new Map([['p', 'Kids']])).at(-1)).toMatchObject({ label: 'Kids', labelKey: null, selected: true, readOnly: true });
    expect(purposeOptions(sel, []).at(-1)).toMatchObject({ labelKey: 'decide.v3.ui.ownOptions.removedName', label: null, readOnly: true });
  });
  it('a live own option is not duplicated', () => {
    expect(purposeOptions({ kind: 'custom', id: 'p' }, [{ id: 'p', label: 'K' }])).toHaveLength(7);
    expect(itemTypeOptions({ kind: 'custom', id: 'p' }, [{ id: 'p', label: 'K' }])).toHaveLength(10);
  });
});

describe('withJustAdded (05.3-118, UAT gap 35)', () => {
  const bike = { id: 'b', label: 'Bike' };
  it('nothing just added returns the same list', () => {
    const custom = [{ id: 'a', label: 'A' }];
    expect(withJustAdded(custom, null)).toBe(custom);
  });
  it('adds the just-saved option at the end while the cache does not hold it', () => {
    expect(withJustAdded([{ id: 'a', label: 'A' }], bike)).toEqual([{ id: 'a', label: 'A' }, bike]);
  });
  it('the cache wins once it holds the id, including a newer name', () => {
    const custom = [{ id: 'b', label: 'Bicycle' }];
    expect(withJustAdded(custom, bike)).toBe(custom);
  });
  it('a selected just-added kind is a selectable chip with its own name, not the removed copy', () => {
    const o = itemTypeOptions({ kind: 'custom', id: 'b' }, withJustAdded([], bike));
    expect(o).toHaveLength(10);
    expect(o.at(-1)).toMatchObject({ label: 'Bike', labelKey: null, selected: true, readOnly: false });
  });
});
