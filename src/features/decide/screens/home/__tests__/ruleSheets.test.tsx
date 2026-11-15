// 06.1-58 (A-SH-2, A-SH-3, D49, D50, D53): the rule sheet's preset chips, today line, switch place, Close and Remove; Add rule and
// Something changed in grouped cards with the selected tint. Haptics, toast and data hooks are mocked.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { AddRuleSheet } from '../AddRuleSheet';
import { EMPTY_RULES } from '../homeCardsModel';
import { RuleEditSheet } from '../RuleEditSheet';
import { SomethingChanged, SomethingChangedSheet } from '../SomethingChanged';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/record/entry/pickers/DateField', () => ({ DateField: () => null }));
jest.mock('@/data/mutations/decideChanges', () => ({
  useAddChange: () => ({ add: jest.fn(() => ({ id: 'c1', stepId: 'step-1' })) }),
  useEditChange: () => ({ edit: jest.fn(() => 'step-3') }),
  useRemoveChange: () => ({ remove: jest.fn(() => 'step-2') }),
}));
jest.mock('@/data/queries/decide', () => ({ useDecideChanges: () => ({ data: [] }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ evaluation: null }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-11-11' }),
}));

const money = (n: number) => `$${n / 100}`;
const editProps = {
  visible: true,
  doc: EMPTY_RULES,
  dsrLine: '36' as string | null,
  currency: 'USD',
  formatMoney: money,
  categoryName: (id: string) => id,
  debtToday: null as { percent: number; amount: number; pay: number } | null,
  usualLeft: null as number | null,
  onOpenGrow: jest.fn(),
  onDismiss: jest.fn(),
};
type J = { type: string; props: Record<string, unknown>; children?: unknown[] | null };
/** Host nodes of the rendered JSON in document order. */
function nodesOf(node: unknown, out: J[] = []): J[] {
  if (!node || typeof node === 'string') return out;
  if (Array.isArray(node)) {
    for (const n of node) nodesOf(n, out);
    return out;
  }
  const j = node as J;
  out.push(j);
  nodesOf(j.children ?? null, out);
  return out;
}
/** How many svg glyphs sit inside the node with this testID. */
function glyphsIn(json: unknown, testID: string): number {
  const host = nodesOf(json).find((n) => n.props.testID === testID);
  return host === undefined ? -1 : nodesOf(host.children ?? null).filter((n) => n.type === 'RNSVGSvgView').length;
}
const selected = (label: string) => screen.getByLabelText(label).props.accessibilityState.selected;

beforeEach(() => jest.clearAllMocks());

describe('RuleEditSheet (D49, A-SH-2)', () => {
  it('a percent rule picks from 30 / 33 / 36 / 40 / Other; the stored share is chosen', async () => {
    const save = jest.fn(() => 's');
    await wrap(<RuleEditSheet {...editProps} target={{ kind: 'debt' }} crossings={() => []} save={save} />);
    for (const p of ['30%', '33%', '36%', '40%', 'Other']) expect(screen.getByLabelText(p)).toBeTruthy();
    expect(selected('36%')).toBe(true);
    expect(selected('30%')).toBe(false);
    await fireEvent.press(screen.getByLabelText('33%'));
    await fireEvent.press(screen.getByLabelText('Save rule'));
    expect(save).toHaveBeenCalledWith({ dsrLine: '33' }, 'ruleEdited');
  });

  it('Other opens a whole-percent field with % after it, within the rule’s range', async () => {
    const save = jest.fn(() => 's');
    await wrap(<RuleEditSheet {...editProps} target={{ kind: 'debt' }} crossings={() => []} save={save} />);
    await fireEvent.press(screen.getByLabelText('Other'));
    expect(screen.getByText('%')).toBeTruthy();
    expect(screen.getByText('5 to 60%')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Debt payments at most, custom, %'), '45');
    expect(screen.getByLabelText('Other: 45%')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save rule'));
    expect(save).toHaveBeenCalledWith({ dsrLine: '45' }, 'ruleEdited');
  });

  it('a stored share off the presets opens on Other with its value', async () => {
    await wrap(<RuleEditSheet {...editProps} dsrLine="50" target={{ kind: 'debt' }} crossings={() => []} save={jest.fn()} />);
    expect(selected('Other: 50%')).toBe(true);
    expect(screen.getByText('5 to 60%')).toBeTruthy();
  });

  it('a category share uses the same chips over a 1 to 100 range', async () => {
    const rule = { id: 'own_category_share_1', kind: 'category_share' as const, on: true, value: 40, categoryId: 'Dining' };
    const save = jest.fn(() => 's');
    await wrap(<RuleEditSheet {...editProps} doc={{ v: 1, rules: [rule] }} target={{ kind: 'stored', rule }} crossings={() => []} save={save} />);
    expect(selected('40%')).toBe(true);
    await fireEvent.press(screen.getByLabelText('Other'));
    expect(screen.getByText('1 to 100%')).toBeTruthy();
  });

  it('shows today’s debt share only when the engine figure is passed in', async () => {
    await wrap(<RuleEditSheet {...editProps} target={{ kind: 'debt' }} crossings={() => []} save={jest.fn()} />);
    expect(screen.queryByTestId('rule-today')).toBeNull();
    await wrap(<RuleEditSheet {...editProps} debtToday={{ percent: 10, amount: 31_200, pay: 320_000 }} target={{ kind: 'debt' }} crossings={() => []} save={jest.fn()} />);
    expect(screen.getByTestId('rule-today')).toHaveTextContent('Today your debt payments are 10% of pay ($312 of $3200).');
  });

  it('a money rule has the currency symbol and its today line; the switch comes after the value', async () => {
    const rule = { id: 'own_keep', kind: 'keep' as const, on: true, value: 30_000, categoryId: null };
    await wrap(<RuleEditSheet {...editProps} usualLeft={36_900} doc={{ v: 1, rules: [rule] }} target={{ kind: 'stored', rule }} crossings={() => []} save={jest.fn()} />);
    expect(screen.getByText('$')).toBeTruthy();
    expect(screen.getByTestId('rule-today')).toHaveTextContent('A usual month leaves $369 today.');
    const order = nodesOf(screen.toJSON())
      .filter((n) => n.props.testID === 'rule-today' || n.props.accessibilityRole === 'switch')
      .map((n) => (n.props.testID === 'rule-today' ? 'today' : 'switch'));
    expect(order.indexOf('today')).toBeLessThan(order.indexOf('switch'));
  });

  it('the dismiss button says Close and closes without saving', async () => {
    const save = jest.fn();
    const onDismiss = jest.fn();
    await wrap(<RuleEditSheet {...editProps} onDismiss={onDismiss} target={{ kind: 'debt' }} crossings={() => []} save={save} />);
    expect(screen.queryByText('Cancel')).toBeNull();
    await fireEvent.press(screen.getByText('Close'));
    expect(onDismiss).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('Remove this rule is offered on an own rule only; the built-in debt share can only be switched off', async () => {
    const save = jest.fn(() => 'step-r');
    const rule = { id: 'own_largest', kind: 'largest' as const, on: true, value: 50_000, categoryId: null };
    await wrap(<RuleEditSheet {...editProps} doc={{ v: 1, rules: [rule] }} target={{ kind: 'stored', rule }} crossings={() => []} save={save} />);
    await fireEvent.press(screen.getByLabelText('Remove this rule'));
    expect(save).toHaveBeenCalledWith({ doc: { v: 1, rules: [] } }, 'ruleRemoved');

    await wrap(<RuleEditSheet {...editProps} target={{ kind: 'debt' }} crossings={() => []} save={save} />);
    expect(screen.queryByLabelText('Remove this rule')).toBeNull();
    await fireEvent.press(screen.getByRole('switch'));
    await fireEvent.press(screen.getByLabelText('Save rule'));
    expect(save).toHaveBeenLastCalledWith({ dsrLine: null }, 'ruleEdited');
  });
});

describe('Add rule and Something changed (D50, D53, A-SH-3)', () => {
  it('Add rule: the kinds sit in one grouped card; the chosen kind gets the accent tint', async () => {
    await wrap(<AddRuleSheet visible doc={EMPTY_RULES} currency="USD" categories={[]} crossings={() => []} save={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.getByTestId('add-rule-kinds')).toBeTruthy();
    expect(screen.queryByTestId('add-rule-kind-largest-tint')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Largest single purchase'));
    expect(screen.getByTestId('add-rule-kind-largest-tint')).toBeTruthy();
    expect(screen.queryByTestId('add-rule-kind-keep-tint')).toBeNull();
    expect(screen.getByText('Close')).toBeTruthy();
  });

  it('Add rule (OQ-80-1 A): a kind already on the list is not offered, so adding never fills that rule', async () => {
    const save = jest.fn(() => 's');
    const largest = { id: 'own_largest', kind: 'largest' as const, on: false, value: 90_000, categoryId: null };
    await wrap(<AddRuleSheet visible doc={{ v: 1, rules: [largest] }} currency="USD" categories={[{ id: 'food', name: 'Food' }]} crossings={() => []} save={save} onDismiss={jest.fn()} />);
    expect(screen.queryByTestId('add-rule-kind-largest')).toBeNull();
    expect(screen.queryByText('Already added')).toBeNull();
    for (const id of ['category_cap', 'category_share', 'keep']) expect(screen.getByTestId(`add-rule-kind-${id}`)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Keep at least'));
    const field = screen.getByLabelText('Value');
    await fireEvent.changeText(field, '300');
    await fireEvent(field, 'blur');
    await fireEvent.press(screen.getByLabelText('Add rule'));
    expect(save).toHaveBeenCalledTimes(1);
    // The largest-purchase rule is kept exactly as it was; the new rule is added beside it.
    expect(save.mock.calls[0]).toEqual([
      { doc: { v: 1, rules: [largest, { id: 'own_keep', kind: 'keep', on: true, value: 30_000, categoryId: null }] } },
      'ruleAdded',
    ]);
  });

  it('Add rule (DB-13): when off, a NeedLine under it says why, and goes once the rule is ready', async () => {
    await wrap(<AddRuleSheet visible doc={EMPTY_RULES} currency="USD" categories={[{ id: 'food', name: 'Food' }]} crossings={() => []} save={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.getByLabelText('Add rule').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('add-rule-need')).toHaveTextContent('A kind and a value are needed.');
    await fireEvent.press(screen.getByLabelText('Spending in one category at most'));
    expect(screen.getByTestId('add-rule-need')).toHaveTextContent('A kind and a value are needed.');
    const field = screen.getByLabelText('Value');
    await fireEvent.changeText(field, '200');
    await fireEvent(field, 'blur');
    expect(screen.getByTestId('add-rule-need')).toHaveTextContent('A category is needed.');
    await fireEvent.press(screen.getByLabelText('Food'));
    expect(screen.getByLabelText('Add rule').props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByTestId('add-rule-need')).toBeNull();
  });

  it('Add rule (DB-13): at the cap the cap line is the reason, with no NeedLine', async () => {
    const five = { v: 1 as const, rules: [1, 2, 3, 4, 5].map((n) => ({ id: `own_category_cap_${n}`, kind: 'category_cap' as const, on: true, value: n, categoryId: 'c' })) };
    await wrap(<AddRuleSheet visible doc={five} currency="USD" categories={[]} crossings={() => []} save={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.getByText('Up to 5 of your own rules.')).toBeTruthy();
    expect(screen.queryByTestId('add-rule-need')).toBeNull();
  });

  it('Add rule: the toast carries the rule step’s Undo label', async () => {
    const { showToast } = jest.requireMock('@/state/undoToast') as { showToast: jest.Mock };
    const save = jest.fn(() => 'step-7');
    await wrap(<AddRuleSheet visible doc={EMPTY_RULES} currency="USD" categories={[]} crossings={() => []} save={save} onDismiss={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Largest single purchase'));
    const field = screen.getByLabelText('Value');
    await fireEvent.changeText(field, '500');
    await fireEvent(field, 'blur');
    await fireEvent.press(screen.getByLabelText('Add rule'));
    expect(showToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.screens.sheetsHome.addRule.toast', params: { undoLabel: 'ruleAdded' } }, stepId: 'step-7' });
  });

  it('Something changed: grouped cards with the tint on the chosen rows, and still nothing chosen for the person', async () => {
    const onSave = jest.fn();
    await wrap(
      <SomethingChangedSheet
        visible
        bills={[{ id: 'b1', name: 'Gym', amount: 4_000 }, { id: 'b2', name: 'Phone', amount: 4_500 }]}
        currency="USD"
        today="2026-11-11"
        usualLeft={40_000}
        usualPay={300_000}
        formatMoney={money}
        formatDate={(d) => d}
        onSave={onSave}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByTestId('changed-kinds')).toBeTruthy();
    expect(screen.queryByTestId('changed-kind-bill-tint')).toBeNull();
    await fireEvent.press(screen.getByLabelText('A bill stopped or paused'));
    expect(screen.getByTestId('changed-kind-bill-tint')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Phone, $45'));
    expect(screen.getByTestId('changed-bill-b2-tint')).toBeTruthy();
    expect(screen.queryByTestId('changed-bill-b1-tint')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('the home row that opens Something changed carries a chevron', async () => {
    await wrap(<SomethingChanged />);
    expect(glyphsIn(screen.toJSON(), 'something-changed-row')).toBe(1);
  });
});
