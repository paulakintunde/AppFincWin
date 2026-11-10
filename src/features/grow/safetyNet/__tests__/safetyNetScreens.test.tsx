// 06-16 (G04, G04a, D-07): the safety net screen, its size sheet with the live preview, the Each month edit and the first-open
// confirm. The 06-12 hooks, the reads and the shell are stubbed so the tests read what the screens decide: which write is made
// (create vs edit, never two nets), the exact payload, and the figures shown.
import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react-native';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { minorUnits } from '@/engine/money';
import { sofaInputs, demoSource } from '@/features/decide/__tests__/helpers/demoScenario';
import { SETTINGS } from '@/features/decide/snapshot/v3/__tests__/growScenarios';
import { wrap } from '@/features/decide/check/steps/__tests__/helpers/stepProps';
import { goal as goalFixture } from '@/features/decide/past/__tests__/helpers/pastFixtures';
import type { GoalsRead } from '@/features/grow/goals/useGoalsRead';
import { FirstOpenNetSheet, resetFirstOpenNetDismissal } from '../FirstOpenNetSheet';
import { NetMonthSheet } from '../NetMonthSheet';
import { NetSizeSheet } from '../NetSizeSheet';
import { SafetyNetScreen } from '../SafetyNetScreen';

jest.setTimeout(30000);

const mockSave = jest.fn((..._a: unknown[]) => ({ id: 'net-new', stepId: 's-save' }));
const mockEdit = jest.fn((..._a: unknown[]) => 's-edit');
const mockConfirmNet = jest.fn((..._a: unknown[]) => 's-confirm-net');
const mockConfirmLine = jest.fn((..._a: unknown[]) => 's-confirm-line');
const mockToast = jest.fn();
const mockLight = jest.fn();

jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-new-series' }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const R = require('react');
  const { View, Text: RNText } = require('react-native');
  return {
    DetailScreen: (p: { title: string; right?: React.ReactNode; children?: React.ReactNode }) =>
      R.createElement(View, null, R.createElement(RNText, null, p.title), p.right, p.children),
  };
});
jest.mock('@/data/mutations/growGoals', () => ({
  useSaveGoalPlan: () => ({ save: (...a: unknown[]) => mockSave(...a) }),
  useEditGoal: () => ({ edit: (...a: unknown[]) => mockEdit(...a), remove: jest.fn() }),
  useConfirmSafetyNet: () => ({ confirm: (...a: unknown[]) => mockConfirmNet(...a) }),
  useConfirmGoalContribution: () => ({ confirm: (...a: unknown[]) => mockConfirmLine(...a) }),
  useMoveGoalMoney: () => ({ move: jest.fn() }),
}));
let mockRows: SavingsGoalRow[] = [];
let mockLines: unknown[] = [];
let mockSeries: unknown[] = [];
jest.mock('@/data/queries/growGoals', () => ({
  useSavingsGoalRows: () => ({ data: mockRows, isError: false, refetch: jest.fn() }),
  useGoalLines: () => ({ data: mockLines }),
}));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: mockSeries }) }));
let mockSavRate: string | null = null;
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'a-sav', name: 'Savings account', currency: 'USD', archived_at: null, interest_rate: mockSavRate },
      { id: 'a-chk', name: 'Everyday checking', currency: 'USD', archived_at: null, interest_rate: null },
    ],
  }),
}));
const mockPushOnce = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPushOnce(...a) }));
// 06-32: the record detail is Activity's; stubbed so the test reads which line it opens.
let mockLegs: unknown[] = [];
jest.mock('@/data/queries/activity', () => ({ useTransferLegs: () => ({ legs: mockLegs }) }));
jest.mock('@/features/record/activity/useRowActions', () => ({ useRowActions: () => ({}) }));
jest.mock('@/features/record/activity/useActivityViewModel', () => {
  const R = require('react');
  return {
    useRowFlow: () => {
      const [row, setRow] = R.useState(null);
      return {
        openDetail: setRow,
        detail: { row, visible: row !== null, onDismiss: () => setRow(null), onStatus: jest.fn(), onEdit: jest.fn(), onClone: jest.fn(), onDelete: jest.fn() },
        pendingDelete: null,
        answerDelete: jest.fn(),
        entryMode: null,
        setEntryMode: jest.fn(),
      };
    },
  };
});
jest.mock('@/features/record/activity/TransactionDetailSheet', () => {
  const R = require('react');
  const { Text: RNText } = require('react-native');
  return {
    TransactionDetailSheet: (p: { visible: boolean; row: { id: string; counterpartAccountId: string | null } | null }) =>
      p.visible && p.row ? R.createElement(RNText, { testID: 'tx-detail' }, `${p.row.id}:${p.row.counterpartAccountId ?? '-'}`) : null,
  };
});
jest.mock('@/features/record/entry/TransactionSheet', () => ({ TransactionSheet: () => null }));
jest.mock('@/features/record/entry/EditScopePrompt', () => ({ EditScopePrompt: () => null }));
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ transferCategoryId: 'cat-transfer' }) }));
let mockOpenChecks: { id: string; name: string; inputs: unknown }[] = [];
jest.mock('@/data/queries/decide', () => ({
  useDecideSettings: () => ({ data: { saving_floor: 15000 } }),
  useOpenChecks: () => ({ data: mockOpenChecks }),
}));
let mockV3: { source: unknown; v3: unknown } = { source: null, v3: null };
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => mockV3 }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', today: '2026-10-03', userId: 'u1', householdId: 'h1', ready: true, timeZone: 'UTC' }),
}));
jest.mock('@/features/decide/past/usePastDecisions', () => ({
  usePastContext: () => ({
    userId: 'u1',
    householdId: 'h1',
    today: '2026-10-03',
    ctx: { home: 'USD', rates: [], customs: [], today: '2026-10-03', timeZone: 'UTC' },
    whole: (m: number) => `$${Math.round(m / 100)}`,
    wholeIn: () => (m: number) => `$${Math.round(m / 100)}`,
    formatDate: (d: string) => `on ${d}`,
  }),
}));
let mockRead: GoalsRead;
jest.mock('@/features/grow/goals/useGoalsRead', () => ({ useGoalsRead: () => mockRead, toHomeOf: () => (a: number) => a }));
jest.mock('@/features/grow/goals/useGoalToast', () => ({ useGoalToast: () => (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/ui/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticLight: () => mockLight(),
  hapticWarning: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticMedium: jest.fn(),
}));
jest.mock('@/features/grow/goals/MoneyMoveSheet', () => {
  const R = require('react');
  const { Text: RNText } = require('react-native');
  return {
    MoneyMoveSheet: (p: { visible: boolean; goal: { id: string } | null; kind: string }) =>
      p.visible && p.goal !== null ? R.createElement(RNText, { testID: 'money-move' }, `${p.kind}:${p.goal.id}`) : null,
  };
});

function netRow(over: Partial<SavingsGoalRow> = {}): SavingsGoalRow {
  return goalFixture('', {
    id: 'net',
    name: 'Safety net',
    kind: 'pot',
    target: 230_000,
    monthly_amount: 10_000,
    ready_by: null,
    opening_saved: 130_000,
    account_id: 'a-sav',
    locked: true,
    is_safety_net: true,
    protect: true,
    bucket: null,
    check_id: null,
    ...over,
  });
}

function readWith(size: number | null, saved: number, over: Partial<GoalsRead['model']> = {}): GoalsRead {
  return {
    status: 'ready',
    userId: 'u1',
    householdId: 'h1',
    today: '2026-10-03',
    refetch: jest.fn(),
    model: {
      safetyNet: { goalId: 'net', size: size === null ? null : minorUnits(size), saved: minorUnits(saved), protect: true, locked: true, accountId: 'a-sav', confirmedAt: '2026-11-01' },
      goals: [],
      totalSaved: saved,
      monthlyIntoGoals: 0,
      needsNetConfirm: false,
      ...over,
    },
  };
}

const noNet: GoalsRead = {
  status: 'ready',
  userId: 'u1',
  householdId: 'h1',
  today: '2026-10-03',
  refetch: jest.fn(),
  model: { safetyNet: null, goals: [], totalSaved: 0, monthlyIntoGoals: 0, needsNetConfirm: false },
};

/** The demo month with every account's use stated and a net holding $5,000, so the sofa is a real verdict. */
function realSource() {
  const base = demoSource('2026-10-03');
  return {
    ...base,
    accounts: base.accounts.map((a) => ({ ...a, use: a.id === 'demo-acct-savings' || a.id === 'demo-acct-investments' ? 'untouched' : 'everyday' })),
    goals: [
      {
        id: 'net', kind: 'pot' as const, check_id: null, currency: 'USD', target: 300_000, monthly_amount: null, ready_by: null, opening_saved: 500_000,
        done_at: null, deleted_at: null, account_id: 'demo-acct-savings', name: 'Safety net', is_safety_net: true, locked: true, protect: true,
      },
    ],
  };
}

async function typeMoney(label: string, text: string) {
  const field = screen.getAllByLabelText(label).find((n) => typeof n.props.onChangeText === 'function')!;
  await fireEvent.changeText(field, text);
  await fireEvent(field, 'blur');
}

beforeEach(() => {
  jest.clearAllMocks();
  resetFirstOpenNetDismissal();
  mockRows = [netRow()];
  mockLines = [];
  mockSeries = [];
  mockOpenChecks = [];
  mockV3 = { source: null, v3: null };
  mockRead = readWith(230_000, 130_000);
  mockSavRate = null;
  mockLegs = [];
});

describe('safety net account, rate and history (06-32, D-32)', () => {
  const line = (over: Record<string, unknown>) => ({
    goal_id: 'net', status: 'paid', deleted_at: null, transfer_id: null, original_amount: -10000, original_currency: 'USD',
    account_id: 'a-chk', household_id: 'h1', version: 1, home_amount: -10000, ...over,
  });

  it('CRUD #8: Kept in opens "Where is it kept?"; Save edits account_id only and shows the toast with Undo', async () => {
    await wrap(<SafetyNetScreen />);
    await fireEvent.press(screen.getByLabelText('Kept in Savings account. Change the account.'));
    expect(screen.getByText('Where is it kept?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Everyday checking'));
    await fireEvent.press(screen.getByText('Save'));
    expect(mockEdit).toHaveBeenCalledTimes(1);
    const [goalArg, patch, owner] = mockEdit.mock.calls[0] as unknown as [SavingsGoalRow, Record<string, unknown>, string];
    expect(goalArg.id).toBe('net');
    expect(patch).toEqual({ account_id: 'a-chk' });
    expect(owner).toBe('u1');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'grow.goals.detail.accountSavedToast', params: { account: 'Everyday checking' }, stepId: 's-edit', undoLabel: 'goalEdited' })
    );
  });

  it('Save stays off until a different account is picked', async () => {
    await wrap(<SafetyNetScreen />);
    await fireEvent.press(screen.getByLabelText('Kept in Savings account. Change the account.'));
    await fireEvent.press(screen.getByText('Save'));
    expect(mockEdit).not.toHaveBeenCalled();
  });

  it('with a rate on the kept-in account, "Interest a year" opens the account; with none there is no row', async () => {
    await wrap(<SafetyNetScreen />);
    expect(screen.queryByText('Interest a year')).toBeNull();
    mockSavRate = '4.1';
    await wrap(<SafetyNetScreen />);
    expect(screen.getByText('4.1%')).toBeTruthy();
    await fireEvent.press(screen.getByText('Interest a year'));
    expect(mockPushOnce).toHaveBeenCalledWith('/accounts/a-sav');
  });

  it('N1: History is a header above the card; rows read date / source / amount; a paid row opens the record', async () => {
    mockLines = [line({ id: 'in1', local_date: '2026-09-20', transfer_id: 't1', account_id: 'a-sav', original_amount: 10000 })];
    mockLegs = [{ id: 'out1', transfer_id: 't1', account_id: 'a-chk' }];
    await wrap(<SafetyNetScreen />);
    const card = screen.getByTestId('net-history');
    expect(screen.getByText('History')).toBeTruthy();
    expect(() => within(card).getByText('History')).toThrow();
    expect(within(card).getByText('Starting amount')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('on 2026-09-20, $100, From Everyday checking. Opens the record.'));
    expect(screen.getByTestId('tx-detail').props.children).toBe('in1:a-chk');
  });

  it('CRUD #6: a waiting Expected line confirms in one tap, once, with Undo', async () => {
    mockLines = [line({ id: 'l1', status: 'pending', local_date: '2026-10-01' })];
    await wrap(<SafetyNetScreen />);
    await fireEvent.press(screen.getByLabelText('Confirm $100 on on 2026-10-01'));
    expect(mockConfirmLine).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ key: 'undo.label.goalContributionConfirmed', stepId: 's-confirm-line' }));
  });
});

describe('safety net screen (G04)', () => {
  it('shows Locked, saved of size, the rows and the footer, and has no Remove action', async () => {
    await wrap(<SafetyNetScreen />);
    expect(screen.getByLabelText('Locked, no Decide answer spends it')).toBeTruthy();
    expect(screen.getByTestId('net-saved').props.children).toBe('$1,300');
    expect(screen.getByText('of $2,300')).toBeTruthy();
    expect(screen.getByText('Size')).toBeTruthy();
    expect(screen.getByText('Kept in')).toBeTruthy();
    expect(screen.getByText('Savings account')).toBeTruthy();
    expect(screen.getByText(/^\$100(\.00)? · reaches it by [A-Z][a-z]{2} 20\d\d$/)).toBeTruthy();
    expect(screen.getByText('This is your own record of money set aside. FincWin is a planning tool, not a bank.')).toBeTruthy();
    expect(screen.queryByText(/remove/i)).toBeNull();
  });

  it('"What it covers" uses the engine\'s usual month going out', async () => {
    mockV3 = { source: realSource(), v3: SETTINGS };
    await wrap(<SafetyNetScreen />);
    expect(screen.getByText('What it covers')).toBeTruthy();
    expect(screen.getByText(/covers about .* of a usual month going out/)).toBeTruthy();
  });

  it('Add money and Take some out open the 06-22 money sheet for the net', async () => {
    await wrap(<SafetyNetScreen />);
    await fireEvent.press(screen.getByText('Add money'));
    expect(screen.getByTestId('money-move').props.children).toBe('add:net');
    await fireEvent.press(screen.getByText('Take some out'));
    expect(screen.getByTestId('money-move').props.children).toBe('take:net');
  });

  it('no net yet: $0, the invitation, no money buttons, and Set a size opens the size sheet', async () => {
    mockRows = [];
    mockRead = noNet;
    await wrap(<SafetyNetScreen />);
    expect(screen.getByTestId('net-saved').props.children).toBe('$0');
    expect(screen.getByText('Decide keeps a safety net out of every answer. Set its size to start.')).toBeTruthy();
    expect(screen.queryByText('Add money')).toBeNull();
    await fireEvent.press(screen.getByText('Set a size'));
    expect(screen.getByText('Safety net size')).toBeTruthy();
  });
});

describe('size sheet, create (no net)', () => {
  it('Save size makes ONE flagged, locked, protected net with the chosen size, with a light haptic and a toast', async () => {
    mockRows = [];
    mockRead = noNet;
    await wrap(<NetSizeSheet visible net={null} saved={0} onClose={jest.fn()} />);
    await typeMoney('Amount', '2775');
    await fireEvent.press(screen.getByText('Save size'));
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockEdit).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledWith({
      ownerId: 'u1',
      householdId: 'h1',
      fields: {
        name: 'Safety net',
        currency: 'USD',
        locked: true,
        protect: true,
        target: 277_500,
        ready_by: null,
        monthly_amount: null,
        opening_saved: 0,
        is_safety_net: true,
      },
      series: null,
    });
    expect(mockLight).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'grow.safetyNet.sizeSheet.savedToast', params: { amount: '$2,775' }, stepId: 's-save', undoLabel: 'safetyNetSizeSaved' })
    );
  });

  it('Save size stays off until there is an amount', async () => {
    await wrap(<NetSizeSheet visible net={null} saved={0} onClose={jest.fn()} />);
    await fireEvent.press(screen.getByText('Save size'));
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('size sheet, edit', () => {
  it('a flagged row with no size yet takes the EDIT path and makes no insert', async () => {
    const row = netRow({ target: null, opening_saved: 0, monthly_amount: null });
    mockRows = [row];
    mockRead = readWith(null, 0);
    await wrap(<NetSizeSheet visible net={row} saved={0} onClose={jest.fn()} />);
    await typeMoney('Amount', '2775');
    await fireEvent.press(screen.getByText('Save size'));
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockEdit).toHaveBeenCalledTimes(1);
    expect(mockEdit).toHaveBeenCalledWith(row, { target: 277_500 }, 'u1', 0);
    expect(Object.keys(mockEdit.mock.calls[0]![1] as object)).toEqual(['target']);
  });

  it('keeps "what you set" as the first choice and edits the size on an existing net', async () => {
    const row = netRow();
    await wrap(<NetSizeSheet visible net={row} saved={130_000} onClose={jest.fn()} />);
    expect(screen.getByText('$2,300 · what you set')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('net-size-own'));
    await typeMoney('Amount', '3000');
    await fireEvent.press(screen.getByText('Save size'));
    expect(mockEdit).toHaveBeenCalledWith(row, { target: 300_000 }, 'u1', 130_000);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('the protect switch writes protect with the size', async () => {
    const row = netRow();
    await wrap(<NetSizeSheet visible net={row} saved={130_000} onClose={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Protect my safety net'));
    await fireEvent.press(screen.getByText('Save size'));
    expect(mockEdit).toHaveBeenCalledWith(row, { target: 230_000, protect: false }, 'u1', 130_000);
  });

  it('refuses a size below what is saved', async () => {
    const row = netRow();
    await wrap(<NetSizeSheet visible net={row} saved={130_000} onClose={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('net-size-own'));
    await typeMoney('Amount', '1000');
    expect(screen.getByTestId('net-size-below')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save size'));
    expect(mockEdit).not.toHaveBeenCalled();
  });

  it('previews how an open check reads with the new size before saving', async () => {
    mockV3 = { source: realSource(), v3: SETTINGS };
    mockOpenChecks = [{ id: 'c-sofa', name: 'Sofa', inputs: sofaInputs }];
    const row = netRow({ target: 300_000, opening_saved: 500_000 });
    await wrap(<NetSizeSheet visible net={row} saved={500_000} onClose={jest.fn()} />);
    expect(screen.getByText('Decide re-checks your open checks with the new size.')).toBeTruthy();
    expect(screen.getByTestId('net-preview-c-sofa').props.children).toMatch(/Fits → Fits$/);
    await fireEvent.press(screen.getByTestId('net-size-own'));
    await typeMoney('Amount', '6000');
    expect(screen.getByTestId('net-preview-c-sofa').props.children).toMatch(/Fits → Tight$/);
    expect(mockEdit).not.toHaveBeenCalled();
  });
});

describe('Each month (GRW-03)', () => {
  const serie = {
    id: 'ser1', household_id: 'h1', account_id: 'a-chk', amount: -10_000, currency: 'USD', anchor_date: '2026-10-16', time_zone: 'UTC',
    name: 'Safety net', category_id: 'cat-transfer', goal_id: 'net', end_date: null, deleted_at: null,
  };
  const props = (series: unknown) => ({ visible: true, net: netRow(), series: series as never, saved: 130_000, onClose: jest.fn(), onSaved: jest.fn() });

  it('saving with the record switch off sends the amount and series null (stops a record)', async () => {
    const p = props(null);
    await wrap(<NetMonthSheet {...p} />);
    await typeMoney('Each month', '150');
    await fireEvent.press(screen.getByText('Save'));
    expect(mockSave).toHaveBeenCalledWith({ ownerId: 'u1', existing: p.net, fields: { monthly_amount: 15_000 }, series: null });
    expect(p.onSaved).toHaveBeenCalledWith('s-save');
    expect(mockLight).toHaveBeenCalledTimes(1);
  });

  it('with the switch on and a record already there, the record is handed back at the new amount', async () => {
    const p = props(serie);
    await wrap(<NetMonthSheet {...p} />);
    await typeMoney('Each month', '150');
    await fireEvent.press(screen.getByText('Save'));
    expect(mockSave).toHaveBeenCalledWith({
      ownerId: 'u1',
      existing: p.net,
      fields: { monthly_amount: 15_000 },
      series: { id: 'ser1', account_id: 'a-chk', amount: 15_000, anchor_date: '2026-10-16', time_zone: 'UTC', name: 'Safety net', category_id: 'cat-transfer' },
    });
  });

  it('turning the switch off on an existing record stops it', async () => {
    const p = props(serie);
    await wrap(<NetMonthSheet {...p} />);
    await fireEvent.press(screen.getByLabelText('Record it each month for me to confirm'));
    await fireEvent.press(screen.getByText('Save'));
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ series: null }));
  });

  it('turning the switch on with no record makes a new one from another account', async () => {
    const p = props(null);
    await wrap(<NetMonthSheet {...p} />);
    await fireEvent.press(screen.getByLabelText('Record it each month for me to confirm'));
    await fireEvent.press(screen.getByText('Save'));
    const call = mockSave.mock.calls[0]![0] as { series: Record<string, unknown> };
    expect(call.series).toMatchObject({ account_id: 'a-chk', amount: 10_000, name: 'Safety net', category_id: 'cat-transfer' });
    expect(call.series.id).toBe('uuid-new-series');
  });
});

describe('first-open confirm (D-07)', () => {
  const confirmable = (saved: number) => readWith(230_000, saved, { needsNetConfirm: true });

  it('shows the title and the net\'s current figures; Looks right confirms once', async () => {
    const row = netRow();
    mockRows = [row];
    mockRead = confirmable(130_000);
    await wrap(<FirstOpenNetSheet />);
    expect(screen.getByText('We moved your safety net here')).toBeTruthy();
    expect(screen.getByText('$1,300 of $2,300 · Locked')).toBeTruthy();
    await fireEvent.press(screen.getByText('Looks right'));
    expect(mockConfirmNet).toHaveBeenCalledTimes(1);
    expect(mockConfirmNet).toHaveBeenCalledWith(row, 'u1');
  });

  it('reads the values at open time, not values captured earlier', async () => {
    mockRead = confirmable(190_000);
    await wrap(<FirstOpenNetSheet />);
    expect(screen.getByText('$1,900 of $2,300 · Locked')).toBeTruthy();
  });

  it('stays away when nothing needs confirming', async () => {
    mockRead = readWith(230_000, 130_000);
    await wrap(<FirstOpenNetSheet />);
    expect(screen.queryByText('We moved your safety net here')).toBeNull();
  });

  it('Change it opens the size sheet on the existing net, without confirming', async () => {
    mockRead = confirmable(130_000);
    await wrap(<FirstOpenNetSheet />);
    await fireEvent.press(screen.getByText('Change it'));
    expect(screen.getByText('Safety net size')).toBeTruthy();
    expect(mockConfirmNet).not.toHaveBeenCalled();
  });

  it('Close dismisses it for this session without confirming', async () => {
    mockRead = confirmable(130_000);
    const view = await wrap(<FirstOpenNetSheet />);
    await fireEvent.press(screen.getByText('Close'));
    expect(screen.queryByText('We moved your safety net here')).toBeNull();
    expect(mockConfirmNet).not.toHaveBeenCalled();
    view.unmount();
    await wrap(<FirstOpenNetSheet />);
    expect(screen.queryByText('We moved your safety net here')).toBeNull();
  });
});
