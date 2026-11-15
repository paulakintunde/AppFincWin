// 05.5-15 (D-11, D-17, OFO-4..OFO-6; UI-SPEC section 3, tests 4 and 5): one cap per category. A cap row reads categories.monthly_cap and
// opens Activity's category sheet; Add rule with Category writes that cap, blocked when one is set; caps are not own rules.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { CategoryRow } from '@/db/rows';
import { hapticWarn } from '@/ui/haptics';
import { showToast } from '@/state/undoToast';
import type { Limits } from '@/engine/decide/v3';
import { wrap } from '@/test/stepProps';
import { AddRuleSheet } from '../AddRuleSheet';
import { EMPTY_RULES, MAX_OWN_RULES } from '../homeCardsModel';
import { MoneyRulesCard } from '../MoneyRulesCard';
import { limitsWith } from '../ruleLimits';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticTick: jest.fn(), hapticWarn: jest.fn(), hapticMilestone: jest.fn(), hapticFailed: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
const mockEdit = jest.fn((_row: CategoryRow, _patch: { monthlyCap?: number | null }) => 'step-cap');
jest.mock('@/data/mutations/categories', () => ({ useEditCategory: () => ({ edit: mockEdit }) }));

const money = (n: number) => `$${n / 100}`;
const catRow = (id: string, cap: number | null): CategoryRow =>
  ({ id, owner_id: 'u1', builtin_key: null, name: id, color_key: 'green', is_system: false, archived_at: null, monthly_cap: cap, is_sample: false, version: 3, updated_by: null, created_at: '', updated_at: '' }) as CategoryRow;

const cardProps = {
  netLocked: true,
  dsrLine: null,
  rules: [],
  saving: null,
  investing: null,
  formatMoney: money,
  categoryName: (id: string) => id,
  onOpenNet: jest.fn(),
  onEdit: jest.fn(),
  onAdd: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe('one cap: Your money rules rows (UI-SPEC test 4)', () => {
  it('a capped category is a row with its Activity cap; tapping it opens the category sheet, never the rule sheet', async () => {
    const onOpenCategory = jest.fn();
    await wrap(<MoneyRulesCard {...cardProps} caps={[{ categoryId: 'Dining', amount: 20_000 }]} onOpenCategory={onOpenCategory} />);
    expect(screen.getByTestId('money-rule-value-cap_Dining')).toHaveTextContent('$200');
    await fireEvent.press(screen.getByTestId('money-rule-cap_Dining'));
    expect(onOpenCategory).toHaveBeenCalledWith('Dining');
    expect(cardProps.onEdit).not.toHaveBeenCalled();
  });

  it('a category with no cap has no row, and a share rule still opens the rule sheet', async () => {
    const share = { id: 'own_share', kind: 'category_share' as const, on: true, value: 10, categoryId: 'Travel' };
    const onOpenCategory = jest.fn();
    await wrap(<MoneyRulesCard {...cardProps} rules={[share]} caps={[]} onOpenCategory={onOpenCategory} />);
    expect(screen.queryByTestId('money-rule-cap_Travel')).toBeNull();
    await fireEvent.press(screen.getByTestId('money-rule-own_share'));
    expect(cardProps.onEdit).toHaveBeenCalledWith({ kind: 'stored', rule: share });
    expect(onOpenCategory).not.toHaveBeenCalled();
  });
});

describe('one cap: Add rule with Category (UI-SPEC test 5)', () => {
  const addCap = async (cats: { id: string; name: string; row: CategoryRow }[], over: Partial<React.ComponentProps<typeof AddRuleSheet>> = {}) => {
    const save = jest.fn(() => 'doc-step');
    const onDismiss = jest.fn();
    await wrap(<AddRuleSheet visible doc={EMPTY_RULES} currency="USD" categories={cats} crossings={() => []} save={save} onDismiss={onDismiss} {...over} />);
    return { save, onDismiss };
  };
  const fill = async (name: string, amount: string) => {
    await fireEvent.press(screen.getByLabelText('Spending in one category at most'));
    const field = screen.getByLabelText('Value');
    await fireEvent.changeText(field, amount);
    await fireEvent(field, 'blur');
    await fireEvent.press(screen.getByLabelText(name));
  };

  it('writes categories.monthly_cap for the chosen category and leaves the rules document alone; the toast carries that step', async () => {
    const row = catRow('food', null);
    const { save, onDismiss } = await addCap([{ id: 'food', name: 'Food', row }]);
    await fill('Food', '200');
    await fireEvent.press(screen.getByLabelText('Add rule'));
    expect(mockEdit).toHaveBeenCalledWith(row, { monthlyCap: 20_000 });
    expect(save).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.screens.sheetsHome.addRule.toast', params: { undoLabel: 'ruleAdded' } }, stepId: 'step-cap' });
    expect(onDismiss).toHaveBeenCalled();
  });

  it('a category that already has a cap is blocked with the capExists sentence and a link to its category sheet', async () => {
    const onOpenCategory = jest.fn();
    await addCap([{ id: 'food', name: 'Food', row: catRow('food', 15_000) }], { onOpenCategory });
    await fill('Food', '200');
    expect(screen.getByText('Food already has a monthly cap. Change it to set a new amount.')).toBeTruthy();
    expect(screen.getByLabelText('Add rule').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByText('Change Food cap'));
    expect(onOpenCategory).toHaveBeenCalledWith('food');
    expect(mockEdit).not.toHaveBeenCalled();
  });

  it('a cap that pushes an open check over it gives the warning haptic and names the check', async () => {
    await addCap([{ id: 'food', name: 'Food', row: catRow('food', null) }], { crossings: () => [{ checkId: 'k1', name: 'Headphones' }] });
    await fill('Food', '200');
    await fireEvent.press(screen.getByLabelText('Add rule'));
    expect(hapticWarn).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning', stepId: 'step-cap', text: expect.objectContaining({ key: 'decide.screens.sheetsHome.rule.crosses' }) }));
  });

  it('OFO-6: caps do not count toward the 5 own rules, so Category still adds at the limit while Keep does not', async () => {
    const five = { v: 1 as const, rules: Array.from({ length: MAX_OWN_RULES }, (_, i) => ({ id: `own_category_share_${i + 1}`, kind: 'category_share' as const, on: true, value: 5, categoryId: 'c' })) };
    await addCap([{ id: 'food', name: 'Food', row: catRow('food', null) }], { doc: five });
    await fill('Food', '200');
    expect(screen.getByLabelText('Add rule').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByLabelText('Keep at least'));
    expect(screen.getByLabelText('Add rule').props.accessibilityState.disabled).toBe(true);
  });
});

describe('one cap: the crossing check sees cap changes', () => {
  const base = {
    lines: [
      { id: 'cap_food', on: true, source: 'own', spec: { kind: 'category_monthly_cap', categoryId: 'food', cap: 10_000 } },
      { id: 'own_largest', on: true, source: 'own', spec: { kind: 'single_purchase_cap', cap: 5_000 } },
    ],
  } as unknown as Limits;
  const capOf = (l: Limits, id: string) => l.lines.find((x) => x.id === `cap_${id}`);

  it('a changed cap replaces its line, a removed cap drops it, a new cap adds one', () => {
    expect(capOf(limitsWith(base, { caps: { food: 7_000 } }), 'food')?.spec).toMatchObject({ cap: 7_000 });
    expect(capOf(limitsWith(base, { caps: { food: null } }), 'food')).toBeUndefined();
    expect(capOf(limitsWith(base, { caps: { rent: 9_000 } }), 'rent')?.spec).toMatchObject({ categoryId: 'rent', cap: 9_000 });
  });

  it('a rules-document change keeps the cap lines', () => {
    const next = limitsWith(base, { doc: EMPTY_RULES });
    expect(capOf(next, 'food')).toBeDefined();
    expect(next.lines.some((l) => l.id === 'own_largest')).toBe(false);
  });
});
