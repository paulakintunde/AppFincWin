// 10.1-25 (SCN-01, D-13): "Scan a receipt" starts an expense, so it sits right after Add expense.
import { QUICK_ACTION_ORDER, availableQuickActions } from '../quickActions';

describe('quickActions: Scan a receipt (10.1-25)', () => {
  it('lists scanReceipt right after addExpense', () => {
    expect(QUICK_ACTION_ORDER.indexOf('scanReceipt')).toBe(QUICK_ACTION_ORDER.indexOf('addExpense') + 1);
  });

  it('shows scanReceipt only when it is registered, in place', () => {
    expect(availableQuickActions(['transfer', 'scanReceipt', 'addExpense', 'addIncome'])).toEqual([
      'addExpense',
      'scanReceipt',
      'addIncome',
      'transfer',
    ]);
    expect(availableQuickActions(['addExpense', 'addIncome'])).toEqual(['addExpense', 'addIncome']);
  });
});
