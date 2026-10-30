import { V3_ITEM_TYPES, type ItemTypeRef, type Purpose } from '@/engine/decide/v3';
import { ITEM_TYPE_ORDER, PURPOSE_ORDER, itemTypeOptions, purposeOptions } from '../checkOptions';

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
