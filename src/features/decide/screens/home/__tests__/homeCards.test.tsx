// 06.1-22: Open checks card, Your money rules (D49, D50) and Something changed? (D53). Haptics, toast and data hooks are mocked.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { hapticLight, hapticWarning } from '@/ui/haptics';
import { showToast } from '@/state/undoToast';
import { wrap } from '@/test/stepProps';
import { AddRuleSheet } from '../AddRuleSheet';
import { changeRowOf, leftWithChange, newlyCrossing, readRulesDoc, withRulesDoc, EMPTY_RULES, type OpenCheckRowModel, type RulesDoc } from '../homeCardsModel';
import { MoneyRulesCard } from '../MoneyRulesCard';
import { OpenChecksCard } from '../OpenChecksCard';
import { RuleEditSheet } from '../RuleEditSheet';
import { ChangedChips, SomethingChanged, SomethingChangedSheet } from '../SomethingChanged';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/record/entry/pickers/DateField', () => ({ DateField: () => null }));

const mockAdd = jest.fn(() => ({ id: 'c1', stepId: 'step-1' }));
const mockRemove = jest.fn(() => 'step-2');
jest.mock('@/data/mutations/decideChanges', () => ({
  useAddChange: () => ({ add: mockAdd }),
  useEditChange: () => ({ edit: jest.fn(() => 'step-3') }),
  useRemoveChange: () => ({ remove: mockRemove }),
}));
jest.mock('@/data/queries/decide', () => ({ useDecideChanges: () => ({ data: [] }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ evaluation: null }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-11-11' }),
}));

const money = (n: number) => `$${n / 100}`;
const date = (d: string) => `on ${d}`;

const row = (over: Partial<OpenCheckRowModel> = {}): OpenCheckRowModel => ({
  id: 'k1',
  name: 'Headphones',
  price: 18_000,
  date: '2026-12-15',
  left: 23_100,
  code: 'fits_month',
  variant: null,
  once: true,
  draft: false,
  payNotChosen: false,
  changed: false,
  checkedOn: '2026-10-22',
  ...over,
});

const cardProps = { formatMoney: money, formatMoneySpoken: money, formatDate: date, today: '2026-11-11', onOpen: jest.fn(), onAddPurchase: jest.fn() };

describe('OpenChecksCard', () => {
  it('has only "+ Purchase" (D-13) and no investment link', async () => {
    await wrap(<OpenChecksCard rows={[row()]} {...cardProps} />);
    expect(screen.getByText('+ Purchase')).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/investment/i);
  });

  it('renders nothing with no open check', async () => {
    await wrap(<OpenChecksCard rows={[]} {...cardProps} />);
    expect(screen.queryByTestId('open-checks-card')).toBeNull();
  });

  it('shows the Draft badge for a draft and says when the records changed', async () => {
    await wrap(<OpenChecksCard rows={[row({ id: 'd', name: 'Laptop', code: null, draft: true, left: null }), row({ changed: true })]} {...cardProps} />);
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByText('Records changed since you looked')).toBeTruthy();
  });

  // 06.1-56 (A-HOME-7, DS-12)
  it('a draft shows its typed price; every row shows its own date; an answered row shows its state word in a badge', async () => {
    await wrap(
      <OpenChecksCard
        rows={[
          row({ id: 'd', name: 'Studio camera body', price: 420_000, code: null, draft: true, left: null, payNotChosen: true, date: null, createdOn: '2026-11-03' }),
          row({ id: 'a', date: null, createdOn: '2026-11-11' }),
        ]}
        {...cardProps}
      />,
    );
    expect(screen.getByText('$4200 · how to pay not chosen · on 2026-11-03')).toBeTruthy();
    expect(screen.getByText('$180 · today · leaves $231')).toBeTruthy();
    expect(screen.getByTestId('open-check-badge-a')).toBeTruthy();
    expect(screen.getAllByText('Draft')).toHaveLength(1);
  });

  it('the spoken label has no empty slot and never ends in an empty value', async () => {
    await wrap(<OpenChecksCard rows={[row({ id: 'n', price: null, left: null, code: null, draft: true, date: null, createdOn: null })]} {...cardProps} />);
    const label = String(screen.getByTestId('open-check-row-n').props.accessibilityLabel);
    expect(label).toBe('Headphones, Draft, today');
    expect(label).not.toMatch(/, ,|, $|leaves\s*$/);
    await wrap(<OpenChecksCard rows={[row({ id: 'f' })]} {...cardProps} />);
    expect(String(screen.getByTestId('open-check-row-f').props.accessibilityLabel)).toMatch(/^Headphones, [^,]+, \$180, on 2026-12-15, leaves \$231$/);
  });

  it('lists the newest 5, then See all opens every open check', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => row({ id: `r${i}`, name: `Item ${i}` }));
    await wrap(<OpenChecksCard rows={rows} {...cardProps} />);
    expect(screen.getByText('Item 4')).toBeTruthy();
    expect(screen.queryByText('Item 5')).toBeNull();
    expect(screen.getByLabelText('See all 7 open checks')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('open-checks-see-all'));
    expect(screen.getByText('Item 6')).toBeTruthy();
    expect(screen.queryByTestId('open-checks-see-all')).toBeNull();
  });

  it('five or fewer open checks need no See all', async () => {
    await wrap(<OpenChecksCard rows={[row(), row({ id: 'k2' })]} {...cardProps} />);
    expect(screen.queryByTestId('open-checks-see-all')).toBeNull();
  });
});

describe('openCheckRowOf (DS-12)', () => {
  it('carries the day the check was made, and keeps a check with no stored answer as a draft', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openCheckRowOf } = require('../useHomeCards') as typeof import('../useHomeCards');
    const r = openCheckRowOf(
      { id: 'x', name: 'Headphones', inputs: { v: 2, price: 18000 }, answer_v3: null, created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-05T10:00:00Z' } as never,
      null,
    );
    expect(r.createdOn).toBe('2026-11-03');
    expect(r.checkedOn).toBe('2026-11-05');
    expect(r.draft).toBe(true);
  });
});

const rulesProps = {
  netLocked: true,
  dsrLine: '30',
  rules: [],
  saving: null,
  investing: 20_000,
  formatMoney: money,
  categoryName: (id: string) => id,
  onOpenNet: jest.fn(),
  onEdit: jest.fn(),
  onAdd: jest.fn(),
};

describe('MoneyRulesCard', () => {
  it('is called Your money rules, with rules and never lines', async () => {
    await wrap(<MoneyRulesCard {...rulesProps} />);
    expect(screen.getByText('Your money rules')).toBeTruthy();
    expect(screen.getByText('+ Add your own rule')).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/\blines?\b|will not cross/i);
  });

  it('puts the safety net first with its Locked word and opens it', async () => {
    await wrap(<MoneyRulesCard {...rulesProps} />);
    expect(screen.getByText('Locked · no answer spends it')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('money-rules-net'));
    expect(rulesProps.onOpenNet).toHaveBeenCalled();
  });

  // 06.1-56 (A-HOME-8)
  it('each rule row is its name over a sub-line with its own figure at the right; On/Off is spoken only', async () => {
    const rules = [
      { id: 'own_keep', kind: 'keep' as const, on: true, value: 30_000, categoryId: null },
      { id: 'own_largest', kind: 'largest' as const, on: false, value: 50_000, categoryId: null },
      { id: 'own_cap', kind: 'category_cap' as const, on: true, value: 20_000, categoryId: 'Dining' },
      { id: 'own_share', kind: 'category_share' as const, on: true, value: 10, categoryId: 'Dining' },
    ];
    await wrap(<MoneyRulesCard {...rulesProps} saving={15_000} rules={rules} />);
    expect(screen.getByText('Debt payments at most')).toBeTruthy();
    expect(screen.getByText('Share of pay, all debts counted.')).toBeTruthy();
    expect(screen.getByTestId('money-rule-value-debt')).toHaveTextContent('30%');
    expect(screen.getByTestId('money-rule-value-investing')).toHaveTextContent('$200');
    expect(screen.getByTestId('money-rule-value-saving')).toHaveTextContent('$150');
    expect(screen.getByTestId('money-rule-value-own_keep')).toHaveTextContent('$300');
    expect(screen.getByTestId('money-rule-value-own_largest')).toHaveTextContent('$500');
    expect(screen.getByTestId('money-rule-value-own_cap')).toHaveTextContent('$200');
    expect(screen.getByTestId('money-rule-value-own_share')).toHaveTextContent('10%');
    expect(screen.getAllByText('Dining at most')).toHaveLength(2);
    expect(screen.queryByText('On')).toBeNull();
    expect(screen.queryByText('Off')).toBeNull();
    expect(screen.getByTestId('money-rule-debt').props.accessibilityLabel).toBe('Debt payments at most, 30%, On. Opens the rule');
    expect(screen.getByTestId('money-rule-own_largest').props.accessibilityLabel).toBe('Largest single purchase, $500, Off. Opens the rule');
    await fireEvent.press(screen.getByTestId('money-rule-own_keep'));
    expect(rulesProps.onEdit).toHaveBeenCalledWith({ kind: 'stored', rule: rules[0] });
  });

  it('the debt share switched off has no figure and says Off in its label', async () => {
    await wrap(<MoneyRulesCard {...rulesProps} dsrLine={null} />);
    expect(screen.queryByTestId('money-rule-value-debt')).toBeNull();
    expect(screen.getByTestId('money-rule-debt').props.accessibilityLabel).toBe('Debt payments at most, Off. Opens the rule');
  });
});

const editProps = {
  visible: true,
  doc: EMPTY_RULES as RulesDoc,
  dsrLine: null,
  currency: 'USD',
  formatMoney: money,
  categoryName: (id: string) => id,
  debtToday: null,
  usualLeft: 40_000,
  onOpenGrow: jest.fn(),
  onDismiss: jest.fn(),
};

describe('RuleEditSheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('plays the warning haptic and names the check when the rule makes an open check cross it', async () => {
    const save = jest.fn(() => 'step-9');
    const crossings = jest.fn(() => [{ checkId: 'k1', name: 'Headphones' }]);
    const rule = { id: 'own_keep', kind: 'keep' as const, on: true, value: 30_000, categoryId: null };
    await wrap(<RuleEditSheet {...editProps} doc={{ v: 1, rules: [rule] }} target={{ kind: 'stored', rule }} crossings={crossings} save={save} />);
    await fireEvent.press(screen.getByLabelText('Save rule'));
    expect(save).toHaveBeenCalledTimes(1);
    expect(hapticWarning).toHaveBeenCalledTimes(1);
    expect(hapticLight).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'warning', stepId: 'step-9', text: { key: 'decide.screens.sheetsHome.rule.crosses', params: { count: 1, item: 'Headphones', undoLabel: 'ruleEdited' } } }),
    );
  });

  it('plays the light haptic when nothing is crossed', async () => {
    const save = jest.fn(() => 'step-9');
    const rule = { id: 'own_largest', kind: 'largest' as const, on: true, value: 50_000, categoryId: null };
    await wrap(<RuleEditSheet {...editProps} doc={{ v: 1, rules: [rule] }} target={{ kind: 'stored', rule }} crossings={() => []} save={save} />);
    await fireEvent.press(screen.getByLabelText('Save rule'));
    expect(hapticLight).toHaveBeenCalledTimes(1);
    expect(hapticWarning).not.toHaveBeenCalled();
  });

  it('saves the debt share as text, or null when switched off', async () => {
    const save = jest.fn(() => 's');
    await wrap(<RuleEditSheet {...editProps} dsrLine="30" target={{ kind: 'debt' }} crossings={() => []} save={save} />);
    await fireEvent.press(screen.getByLabelText('Save rule'));
    expect(save).toHaveBeenCalledWith({ dsrLine: '30' }, 'ruleEdited');
  });

  it('makes investing read-only with Open in Grow', async () => {
    const save = jest.fn();
    await wrap(<RuleEditSheet {...editProps} target={{ kind: 'investing', amount: 20_000 }} crossings={() => []} save={save} />);
    expect(screen.queryByLabelText('Save rule')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Open in Grow'));
    expect(editProps.onOpenGrow).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('removes an own rule with an undoable step', async () => {
    const save = jest.fn(() => 'step-r');
    const rule = { id: 'own_keep', kind: 'keep' as const, on: true, value: 30_000, categoryId: null };
    await wrap(<RuleEditSheet {...editProps} doc={{ v: 1, rules: [rule] }} target={{ kind: 'stored', rule }} crossings={() => []} save={save} />);
    await fireEvent.press(screen.getByLabelText('Remove this rule'));
    expect(save).toHaveBeenCalledWith({ doc: { v: 1, rules: [] } }, 'ruleRemoved');
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-r' }));
  });
});

describe('AddRuleSheet', () => {
  const five: RulesDoc = {
    v: 1,
    rules: [1, 2, 3, 4, 5].map((n) => ({ id: `own_category_cap_${n}`, kind: 'category_cap' as const, on: true, value: 1000 * n, categoryId: 'c' })),
  };

  it('disables the 6th own rule', async () => {
    await wrap(<AddRuleSheet visible doc={five} currency="USD" categories={[{ id: 'c', name: 'Food' }]} crossings={() => []} save={jest.fn()} onDismiss={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Largest single purchase'));
    await fireEvent.changeText(screen.getByLabelText('Value'), '500');
    expect(screen.getByLabelText('Add rule').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Up to 5 of your own rules.')).toBeTruthy();
  });

  it('pre-selects no kind, then adds once a kind and value are given', async () => {
    const save = jest.fn(() => 's');
    await wrap(<AddRuleSheet visible doc={EMPTY_RULES} currency="USD" categories={[]} crossings={() => []} save={save} onDismiss={jest.fn()} />);
    for (const label of ['Largest single purchase', 'Keep at least']) {
      expect(screen.getByLabelText(label).props.accessibilityState.selected).toBe(false);
    }
    expect(screen.getByLabelText('Add rule').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Largest single purchase'));
    const field = screen.getByLabelText('Value');
    await fireEvent.changeText(field, '500');
    await fireEvent(field, 'blur');
    await fireEvent.press(screen.getByLabelText('Add rule'));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]).toEqual([{ doc: { v: 1, rules: [{ id: 'own_largest', kind: 'largest', on: true, value: 50_000, categoryId: null }] } }, 'ruleAdded']);
  });
});

describe('Something changed? (D53)', () => {
  beforeEach(() => jest.clearAllMocks());
  const sheetProps = {
    visible: true,
    bills: [{ id: 'b1', name: 'Gym', amount: 4_000 }],
    currency: 'USD',
    today: '2026-11-11',
    usualLeft: 40_000,
    usualPay: 300_000,
    formatMoney: money,
    formatDate: date,
    onDismiss: jest.fn(),
  };

  it('suggests nothing: no option is chosen and Save is disabled', async () => {
    const onSave = jest.fn();
    await wrap(<SomethingChangedSheet {...sheetProps} onSave={onSave} />);
    for (const label of ['My pay changed', 'A bill stopped or paused', 'A one-off cost is coming']) {
      expect(screen.getByLabelText(label).props.accessibilityState.selected).toBe(false);
    }
    expect(screen.getByLabelText('Save what changed').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Save what changed'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('hands one entry back only on Save, and says what a usual month would leave', async () => {
    const onSave = jest.fn();
    await wrap(<SomethingChangedSheet {...sheetProps} onSave={onSave} />);
    await fireEvent.press(screen.getByLabelText('A bill stopped or paused'));
    await fireEvent.press(screen.getByLabelText('Gym, $40'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('With this change, a usual month would leave $440.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save what changed'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ kind: 'bill', seriesId: 'b1', status: 'stopped', amount: 4_000 });
  });

  it('writes once and shows Undo when saved from home', async () => {
    mockAdd.mockClear();
    await wrap(<SomethingChanged />);
    await fireEvent.press(screen.getByLabelText('Something changed?. Pay, a bill or a one-off cost'));
    await fireEvent.press(screen.getByLabelText('A one-off cost is coming'));
    const field = screen.getByLabelText('Amount');
    await fireEvent.changeText(field, '120');
    await fireEvent(field, 'blur');
    await fireEvent.press(screen.getByLabelText('Save what changed'));
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect((mockAdd.mock.calls as unknown as unknown[][])[0]?.[0]).toMatchObject({ householdId: 'h1', ownerId: 'u1', change: { kind: 'spending', monthly_amount: 12_000, start_month: '2026-11', end_month: '2026-11' } });
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ordinary', stepId: 'step-1' }));
  });

  it('shows a Changed line with Change and Reset (06.1-80, DC-10)', async () => {
    const onReset = jest.fn();
    const onChange = jest.fn();
    await wrap(
      <ChangedChips
        changes={[
          { id: 'c1', line: 'Changed: Gym stopped', spoken: 'Gym stopped', editable: true },
          { id: 'c2', line: 'Changed: Old row', spoken: 'Old row', editable: false },
        ]}
        onReset={onReset}
        onChange={onChange}
      />,
    );
    expect(screen.getByText('Changed: Gym stopped')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Reset the change: Gym stopped'));
    expect(onReset).toHaveBeenCalledWith('c1');
    await fireEvent.press(screen.getByLabelText('Change, Gym stopped'));
    expect(onChange).toHaveBeenCalledWith('c1');
    expect(screen.queryByLabelText('Change, Old row')).toBeNull();
    expect(screen.getByLabelText('Reset the change: Old row')).toBeTruthy();
  });
});

describe('homeCardsModel', () => {
  it('reads and writes the rules document without losing other custom options', () => {
    const doc: RulesDoc = { v: 1, rules: [{ id: 'own_keep', kind: 'keep', on: true, value: 30_000, categoryId: null }] };
    const written = withRulesDoc({ itemTypes: ['x'] }, doc);
    expect(written.itemTypes).toEqual(['x']);
    expect(readRulesDoc(written)).toEqual(doc);
    expect(readRulesDoc(null)).toEqual(EMPTY_RULES);
    expect(readRulesDoc({ rules: { rules: [{ id: 'a', kind: 'nope', value: 1 }] } })).toEqual(EMPTY_RULES);
  });

  it('names a check only when a line is newly crossed or a calm answer turns strained', () => {
    const before = [
      { checkId: 'a', name: 'A', lineIds: [], tone: 'fits' },
      { checkId: 'b', name: 'B', lineIds: [], tone: 'tight' },
      { checkId: 'c', name: 'C', lineIds: [], tone: 'fits' },
    ];
    const after = [
      { checkId: 'a', name: 'A', lineIds: ['own_largest'], tone: 'fits' },
      { checkId: 'b', name: 'B', lineIds: [], tone: 'short' },
      { checkId: 'c', name: 'C', lineIds: [], tone: 'tight' },
    ];
    expect(newlyCrossing(before, after).map((c) => c.checkId)).toEqual(['a', 'c']);
  });

  it('maps a report to a change row', () => {
    expect(changeRowOf({ kind: 'pay', amount: 350_000, from: '2026-12-01' }, 'Pay', 300_000)).toMatchObject({ kind: 'income', monthly_amount: 50_000, start_month: '2026-12', end_month: null });
    expect(changeRowOf({ kind: 'bill', seriesId: 'b', name: 'Gym', amount: 4_000, status: 'paused', from: '2026-12-05' }, 'Gym paused', null)).toMatchObject({ kind: 'spending', monthly_amount: -4_000 });
    expect(leftWithChange({ kind: 'oneOff', amount: 1, date: '2026-12-01' }, 100, 100)).toBeNull();
  });
});
