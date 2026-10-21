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
    });
  });

  it('leaves out a prompt whose category the user no longer has, and loss of value never has one', () => {
    const ids = new Map<BuiltinCategoryKey, string>([['Insurance', 'cat-ins']]);
    expect(runningCostCategoryIds(ids)).toEqual({ insurance: 'cat-ins' });
    expect(RUNNING_COST_BUILTIN.loss_of_value).toBeUndefined();
  });
});
