import { QUICK_ACTION_ORDER, availableQuickActions, type QuickActionId } from '../quickActions';

describe('quickActions (D-11)', () => {
  it('keeps the D-11 order', () => {
    expect(QUICK_ACTION_ORDER).toEqual(['addExpense', 'addIncome', 'transfer', 'newCheck', 'importStatement']);
  });
  it('returns only registered entries in D-11 order', () => {
    expect(availableQuickActions(['importStatement', 'addExpense'])).toEqual(['addExpense', 'importStatement']);
    expect(availableQuickActions([])).toEqual([]);
  });
  it('accepts a Set', () => {
    const set: ReadonlySet<QuickActionId> = new Set<QuickActionId>(['transfer', 'addIncome']);
    expect(availableQuickActions(set)).toEqual(['addIncome', 'transfer']);
  });
});
