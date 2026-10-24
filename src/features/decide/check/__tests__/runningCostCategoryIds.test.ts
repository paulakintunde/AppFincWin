// WR-A11: Go ahead's running-cost series keep the category of the prompt they came from.
import type { BuiltinCategoryKey } from '@/engine/categorize';
import { RUNNING_COST_BUILTIN, runningCostCategoryIds } from '../commitMutations';

describe('runningCostCategoryIds', () => {
  it('maps each cash prompt to the user\'s built-in category id', () => {
    const ids = new Map<BuiltinCategoryKey, string>([
      ['Insurance', 'cat-ins'],
      ['Transport', 'cat-trans'],
      ['Debt', 'cat-debt'],
    ]);
    expect(runningCostCategoryIds(ids)).toEqual({
      insurance: 'cat-ins',
      fuel: 'cat-trans',
      maintenance: 'cat-trans',
      registration: 'cat-trans',
      home_insurance: 'cat-ins',
      travel: 'cat-trans',
    });
  });

  it('D-92 the new running costs map to built-in categories', () => {
    const ids = new Map<BuiltinCategoryKey, string>([
      ['Tax', 'cat-tax'],
      ['Insurance', 'cat-ins'],
      ['Utilities', 'cat-util'],
      ['Housing', 'cat-house'],
      ['Transport', 'cat-trans'],
    ]);
    const out = runningCostCategoryIds(ids);
    expect(out).toMatchObject({
      property_tax: 'cat-tax',
      home_insurance: 'cat-ins',
      utilities: 'cat-util',
      service_charge: 'cat-house',
      accommodation: 'cat-house',
      travel: 'cat-trans',
    });
    // no Education built-in: books_materials is unmapped
    expect(RUNNING_COST_BUILTIN.books_materials).toBeUndefined();
    expect(out.books_materials).toBeUndefined();
  });

  it('leaves out a prompt whose category the user no longer has, and loss of value never has one', () => {
    const ids = new Map<BuiltinCategoryKey, string>([['Insurance', 'cat-ins']]);
    expect(runningCostCategoryIds(ids)).toEqual({ insurance: 'cat-ins', home_insurance: 'cat-ins' });
    expect(RUNNING_COST_BUILTIN.loss_of_value).toBeUndefined();
  });
});
