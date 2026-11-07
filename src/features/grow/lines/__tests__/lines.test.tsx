// 06-16 (G10, G10a, D-27): "Your money rules" on the EXISTING lines store. The reads, the settings mutation and the shell are
// stubbed so the tests read what the screen decides: the figures and statuses, the exact patch written, and the Undo.
import fs from 'fs';
import path from 'path';
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { minorUnits } from '@/engine/money';
import { wrap } from '@/features/decide/check/steps/__tests__/helpers/stepProps';
import type { GoalsRead } from '@/features/grow/goals/useGoalsRead';
import { GrowLinesScreen } from '../GrowLinesScreen';

jest.setTimeout(30000);

const mockPush = jest.fn();
const mockUpdate = jest.fn();
const mockShowToast = jest.fn();
const mockLight = jest.fn();

jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPush(h) }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const R = require('react');
  const { View, Text: RNText } = require('react-native');
  return {
    DetailScreen: (p: { title: string; right?: React.ReactNode; children?: React.ReactNode }) =>
      R.createElement(View, null, R.createElement(RNText, null, p.title), p.right, p.children),
  };
});
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockShowToast(t) }));
jest.mock('@/ui/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticLight: () => mockLight(),
  hapticWarning: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticMedium: jest.fn(),
}));
jest.mock('@/data/mutations/decideSettings', () => ({ useUpdateDecideSettings: () => ({ update: (p: unknown) => mockUpdate(p) }) }));
let mockSettings: Record<string, unknown> | null = null;
let mockResult: unknown = null;
jest.mock('@/data/queries/decide', () => ({
  useDecideSettings: () => ({ data: mockSettings }),
  useDecideSnapshot: () => ({ result: mockResult, status: 'ready' }),
}));
jest.mock('@/engine/decide', () => ({
  ...jest.requireActual('@/engine/decide'),
  prepareContext: () => ({ ok: true, context: { limits: { dsrLine: 36n * 10n ** 10n, investingFloor: 15_000, savingFloor: 10_000 } } }),
}));
jest.mock('@/features/decide/home/homeCardModel', () => ({ monthBreakdown: () => ({ income: 500_000, debts: 50_000 }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', today: '2026-11-05', userId: 'u1', householdId: 'h1', ready: true, timeZone: 'UTC' }),
}));
let mockRead: GoalsRead;
jest.mock('@/features/grow/goals/useGoalsRead', () => ({ useGoalsRead: () => mockRead }));

const LEDGER_READ: GoalsRead = {
  status: 'ready',
  userId: 'u1',
  householdId: 'h1',
  today: '2026-11-05',
  refetch: jest.fn(),
  model: {
    safetyNet: { goalId: 'net', size: minorUnits(230_000), saved: minorUnits(130_000), protect: true, locked: true, accountId: null, confirmedAt: '2026-11-01' },
    goals: [],
    totalSaved: 130_000,
    monthlyIntoGoals: 0,
    needsNetConfirm: false,
  },
};

const logged = (monthlyInvesting: number, monthlySaving: number) => ({
  kind: 'logged',
  currency: 'USD',
  snapshot: { monthlyInvesting, monthlySaving },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRead = LEDGER_READ;
  mockSettings = { currency: 'USD', dsr_line: '36', investing_floor: 20_000, saving_floor: 15_000 };
  mockResult = logged(20_000, 15_000);
});

describe('Your money rules (G10)', () => {
  it('shows the safety net and the three rules with where each stands', async () => {
    await wrap(<GrowLinesScreen />);
    expect(screen.getByText('Your money rules')).toBeTruthy();
    expect(screen.getByText('Every answer keeps to these. Tap one to change it.')).toBeTruthy();
    expect(screen.getByText('Safety net')).toBeTruthy();
    expect(screen.getByText('Locked · no answer spends it')).toBeTruthy();
    expect(screen.getByText('$1,300')).toBeTruthy();
    expect(screen.getByText('of $2,300 goal')).toBeTruthy();
    expect(screen.getByText('Debt payments at most')).toBeTruthy();
    expect(screen.getByText('36%')).toBeTruthy();
    expect(screen.getByText('Now 10%')).toBeTruthy();
    expect(screen.getByText('Investing at least')).toBeTruthy();
    expect(screen.getAllByText('$200').length).toBeGreaterThan(0);
    expect(screen.getByText('Met · $200 set up')).toBeTruthy();
    expect(screen.getByText('Saving at least')).toBeTruthy();
    expect(screen.getByText('Met · $150 set up')).toBeTruthy();
    expect(screen.getByText('These are your own rules. FincWin uses them to word its answers; it doesn’t set them for you.')).toBeTruthy();
  });

  it('a rule that is not met says so with what is set up', async () => {
    mockResult = logged(10_000, 15_000);
    await wrap(<GrowLinesScreen />);
    expect(screen.getByText('Not yet · $100 set up')).toBeTruthy();
    expect(screen.getByText('Met · $150 set up')).toBeTruthy();
  });

  it('a rule with no figure of its own shows the engine default, tagged', async () => {
    mockSettings = { currency: 'USD', dsr_line: null, investing_floor: null, saving_floor: null };
    await wrap(<GrowLinesScreen />);
    expect(screen.getByText('36%')).toBeTruthy();
    expect(screen.getByText('$150')).toBeTruthy();
    expect(screen.getAllByText('default')).toHaveLength(3);
  });

  it('the safety net row opens the safety net screen', async () => {
    await wrap(<GrowLinesScreen />);
    await fireEvent.press(screen.getByTestId('lines-row-net'));
    expect(mockPush).toHaveBeenCalledWith('/grow/safety-net');
  });
});

describe('Change a rule (G10a)', () => {
  it('the debt rule steps in 1-point steps and saves dsr_line, with a light haptic and a toast that undoes it', async () => {
    await wrap(<GrowLinesScreen />);
    await fireEvent.press(screen.getByTestId('lines-row-debt'));
    expect(screen.getByText('Change a rule')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('grow-stepper-plus'));
    await fireEvent.press(screen.getByTestId('grow-stepper-plus'));
    await fireEvent.press(screen.getByTestId('grow-stepper-minus'));
    await fireEvent.press(screen.getByText('Save rule'));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({ dsr_line: '37' });
    expect(mockLight).toHaveBeenCalledTimes(1);
    const toast = mockShowToast.mock.calls[0]![0] as { text: { key: string }; onUndo: () => void };
    expect(toast.text.key).toBe('grow.lines.change.savedToast');
    toast.onUndo();
    expect(mockUpdate).toHaveBeenLastCalledWith({ dsr_line: '36' });
  });

  it('a money rule takes an amount and writes only its own column, stamping the currency', async () => {
    await wrap(<GrowLinesScreen />);
    await fireEvent.press(screen.getByTestId('lines-row-investing'));
    const field = screen.getAllByLabelText('Investing at least').find((n) => typeof n.props.onChangeText === 'function')!;
    await fireEvent.changeText(field, '250');
    await fireEvent(field, 'blur');
    await fireEvent.press(screen.getByText('Save rule'));
    expect(mockUpdate).toHaveBeenCalledWith({ investing_floor: 25_000, currency: 'USD' });
    const toast = mockShowToast.mock.calls[0]![0] as { onUndo: () => void };
    toast.onUndo();
    expect(mockUpdate).toHaveBeenLastCalledWith({ investing_floor: 20_000, currency: 'USD' });
  });

  it('switching the rule off saves the line as null and says answers stop checking it', async () => {
    await wrap(<GrowLinesScreen />);
    await fireEvent.press(screen.getByTestId('lines-row-saving'));
    expect(screen.queryByTestId('line-off-note')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Use this rule'));
    expect(screen.getByText('Off, answers use the standard rule instead.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save rule'));
    expect(mockUpdate).toHaveBeenCalledWith({ saving_floor: null });
  });

  it('Cancel writes nothing', async () => {
    await wrap(<GrowLinesScreen />);
    await fireEvent.press(screen.getByTestId('lines-row-debt'));
    await fireEvent.press(screen.getByText('Cancel'));
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.queryByText('Change a rule')).toBeNull();
  });
});

describe('no second store (T-06-16-02)', () => {
  it('the lines code reads and writes only through the existing settings hooks, never a table directly', () => {
    const dir = path.join(__dirname, '..');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.tsx'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src).not.toMatch(/from\('[a-z_]+'\)/);
      expect(src).not.toMatch(/\.from\(/);
    }
  });

  it('copy never uses advice words', () => {
    const dir = path.join(__dirname, '..');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.tsx'))) {
      expect(fs.readFileSync(path.join(dir, f), 'utf8')).not.toMatch(/\b(advice|recommend\w*|should|optimal)\b/i);
    }
  });
});
