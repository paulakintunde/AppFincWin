// 08.1-09 (D-09..D-11, UI-SPEC section 5): Record as bought tick rows. Writes are mocked; the figures come from a real engine run.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { CheckV2, RunningCostLine, StoppedCost } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import en from '@/i18n/locales/en';
import { showToast } from '@/state/undoToast';
import { wrap } from '@/test/stepProps';
import { ledgerRun } from '../../answer/__tests__/fixtures';
import { BoughtScreen } from '../BoughtScreen';
import { boughtRowsOf, initialTicks } from '../BoughtSaveRows';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticTick: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/screen/DetailScreen', () => ({
  DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => {
    const { Text, View } = jest.requireActual('react-native');
    return (
      <View testID="detail-frame">
        <Text testID="detail-title">{title}</Text>
        {children}
      </View>
    );
  },
}));
const mockUndo = jest.fn();
const mockGoAhead = jest.fn();
jest.mock('@/data/mutations/undo', () => ({ useUndo: () => ({ undo: mockUndo }) }));

const a = en.decide.screens.answerActions;
const TODAY = '2026-11-11';
const fmt = (n: number) => `$${n / 100}`;
const fmtDate = (d: string) => `on ${d}`;

const line = (id: string, amount: number, over: Partial<RunningCostLine> = {}): RunningCostLine => ({ id, amount: minorUnits(amount), everyMonths: 1, start: TODAY, end: null, on: true, ...over });
const stop = (id: string, seriesId: string): StoppedCost => ({ id, amount: minorUnits(8000), everyMonths: 1, stopDate: '2026-12-01', source: { kind: 'bill', seriesId } });

const r = ledgerRun('N02');
const fuel = line('rc:fuel', 12000, { varies: true });
const insurance = line('rc:insurance', 14000);
const fullCheck: CheckV2 = {
  ...r.check,
  runningCosts: [insurance, fuel],
  replaces: { stops: [stop('s1', 'gym')], sale: { amount: minorUnits(900000), arrives: '2026-12-01', paysDebtId: 'debt-1' } },
};
const props = (over: Partial<React.ComponentProps<typeof BoughtScreen>> = {}): React.ComponentProps<typeof BoughtScreen> => ({
  goAhead: mockGoAhead,
  checkId: 'c1',
  ownerId: 'u1',
  householdId: 'h1',
  homeCurrency: 'USD',
  currency: 'USD',
  timeZone: 'UTC',
  today: TODAY,
  itemName: 'Car',
  v3: fullCheck,
  evaluation: r.evaluation,
  accounts: [{ id: 'acc-1', name: 'Everyday' }],
  stopRows: [{ id: 's1', name: 'Gym', date: '2026-12-01' }],
  payoff: { id: 'debt-1', version: 3, name: 'Old car loan', amount: 600000 },
  goal: { id: 'goal-1', name: 'Car fund' },
  formatMoney: fmt,
  formatDate: fmtDate,
  onDone: jest.fn(),
  ...over,
});

const row = (title: string | RegExp) => screen.getByRole('switch', { name: title });

beforeEach(() => {
  jest.clearAllMocks();
  mockGoAhead.mockReturnValue('step-go');
});

describe('Bought screen: groups and rows', () => {
  it('renders the groups in order with one row per item, and the heading, date line and button words', async () => {
    await wrap(<BoughtScreen {...props()} />);
    expect(screen.getByText(a.bought.title)).toBeTruthy();
    expect(screen.getByText(a.bought.boughtOn.replace('{{date}}', fmtDate(TODAY)))).toBeTruthy();
    expect(screen.getByText(a.bought.groupCosts)).toBeTruthy();
    expect(screen.getByText(a.bought.groupMoney)).toBeTruthy();
    expect(screen.getByText(a.bought.groupStops)).toBeTruthy();
    expect(screen.getByText(a.bought.groupGoal)).toBeTruthy();
    expect(screen.getByText('Insurance, $140 a month')).toBeTruthy();
    expect(screen.getByText('Fuel or charging, about $120 a month')).toBeTruthy();
    expect(screen.getByText(a.bought.subVaries)).toBeTruthy();
    expect(screen.getByText('Cash from selling Old car loan, $9000')).toBeTruthy();
    expect(screen.getByText('Pay off Old car loan, $6000')).toBeTruthy();
    expect(screen.getByText('Gym ends on 2026-12-01.')).toBeTruthy();
    expect(screen.getByText('Close the “Car fund” goal')).toBeTruthy();
    expect(screen.getByText(a.bought.subGoal)).toBeTruthy();
    expect(screen.getAllByRole('switch')).toHaveLength(6);
    expect(a.bought.save).toBe('Record purchase');
    expect(screen.getByText('Record purchase')).toBeTruthy();
  });

  it('omits a group with no rows (no empty card)', async () => {
    await wrap(<BoughtScreen {...props({ v3: r.check, stopRows: [], payoff: null, goal: null })} />);
    for (const heading of [a.bought.groupCosts, a.bought.groupMoney, a.bought.groupStops, a.bought.groupGoal]) expect(screen.queryByText(heading)).toBeNull();
    expect(screen.queryByTestId('bought-save-rows')).toBeNull();
  });

  it('a sale with no recorded loan reads "the old one" and offers no payoff row', async () => {
    await wrap(<BoughtScreen {...props({ payoff: null, stopRows: [], goal: null })} />);
    expect(screen.getByText('Cash from selling the old one, $9000')).toBeTruthy();
    expect(screen.queryByText(/^Pay off/)).toBeNull();
  });

  it('loss of value is never offered as a bill, and an added line shows the name the user gave it', async () => {
    const names = { 'own-1': 'Parking permit' };
    const v3 = { ...r.check, runningCosts: [line('rc:value_loss', 5000), line('own-1', 3000)], layerAnswers: { ...r.check.layerAnswers, 'L0.line_names': names } } as CheckV2;
    await wrap(<BoughtScreen {...props({ v3, stopRows: [], payoff: null, goal: null })} />);
    expect(screen.getByText('Parking permit, $30 a month')).toBeTruthy();
    expect(screen.queryByText(/Loss of value/)).toBeNull();
  });

  it('every row starts unticked except "Close the goal"', async () => {
    await wrap(<BoughtScreen {...props()} />);
    const ticked = screen.getAllByRole('switch').filter((s) => s.props.accessibilityState.checked === true);
    expect(ticked).toHaveLength(1);
    expect(ticked[0]?.props.accessibilityLabel).toMatch(/^Close the “Car fund” goal/);
  });

  it('each row speaks its title, sub-line and state, and the state follows a tick', async () => {
    await wrap(<BoughtScreen {...props()} />);
    expect(row(/^Fuel or charging, about \$120 a month, Counts until actual spending replaces it, not ticked$/)).toBeTruthy();
    expect(row('Insurance, $140 a month, not ticked')).toBeTruthy();
    expect(row('Close the “Car fund” goal, It can stay open., ticked')).toBeTruthy();
    await fireEvent.press(row('Insurance, $140 a month, not ticked'));
    expect(row('Insurance, $140 a month, ticked')).toBeTruthy();
  });
});

describe('Bought screen: what is sent', () => {
  it('unticked parts are not sent; only the goal close goes by default', async () => {
    await wrap(<BoughtScreen {...props()} />);
    await fireEvent.press(screen.getByText(a.bought.save));
    expect(mockGoAhead).toHaveBeenCalledTimes(1);
    expect(mockGoAhead.mock.calls[0][0].extras).toEqual({ runningCosts: [], stops: [], sale: null, payoff: null, goalId: 'goal-1' });
  });

  it('the goal close can be unticked', async () => {
    await wrap(<BoughtScreen {...props()} />);
    await fireEvent.press(row(/^Close the “Car fund” goal/));
    await fireEvent.press(screen.getByText(a.bought.save));
    expect(mockGoAhead.mock.calls[0][0].extras.goalId).toBeNull();
  });

  it('every ticked row is sent: both costs with their names, the stop, the sale, the payoff naming the loan and version', async () => {
    await wrap(<BoughtScreen {...props()} />);
    for (const title of [/^Insurance/, /^Fuel or charging/, /^Cash from selling/, /^Pay off/, /^Gym ends/]) await fireEvent.press(row(title));
    await fireEvent.press(screen.getByText(a.bought.save));
    const extras = mockGoAhead.mock.calls[0][0].extras;
    expect(extras.runningCosts.map((c: { line: RunningCostLine; name: string }) => [c.line.id, c.name, c.line.varies === true])).toEqual([
      ['rc:insurance', 'Insurance', false],
      ['rc:fuel', 'Fuel or charging', true],
    ]);
    expect(extras.stops.map((s: StoppedCost) => s.id)).toEqual(['s1']);
    expect(extras.sale).toEqual({ amount: 900000, name: 'Old car loan' });
    expect(extras.payoff).toEqual({ amount: 600000, name: 'Old car loan', debtId: 'debt-1', version: 3 });
    expect(extras.goalId).toBe('goal-1');
  });

  it('the payoff is not sent when only the sale is ticked, and the sale alone is sent', async () => {
    await wrap(<BoughtScreen {...props()} />);
    await fireEvent.press(row(/^Cash from selling/));
    await fireEvent.press(screen.getByText(a.bought.save));
    const extras = mockGoAhead.mock.calls[0][0].extras;
    expect(extras.sale).toEqual({ amount: 900000, name: 'Old car loan' });
    expect(extras.payoff).toBeNull();
  });

  it('a tick can be taken back before saving', async () => {
    await wrap(<BoughtScreen {...props()} />);
    await fireEvent.press(row(/^Insurance/));
    await fireEvent.press(row(/^Insurance/));
    await fireEvent.press(screen.getByText(a.bought.save));
    expect(mockGoAhead.mock.calls[0][0].extras.runningCosts).toEqual([]);
  });
});

describe('Bought screen: after the save', () => {
  it('shows the toast "Saved: {item}." with the step, and one Undo reverses the whole save', async () => {
    await wrap(<BoughtScreen {...props()} />);
    await fireEvent.press(screen.getByText(a.bought.save));
    expect(showToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'decide.screens.answerActions.bought.toast', params: { item: 'Car' } }, stepId: 'step-go' });
    expect(en.decide.screens.answerActions.bought.toast.replace('{{item}}', 'Car')).toBe('Saved: Car.');
    await fireEvent.press(await screen.findByText(en.decide.screens.common.undo));
    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockUndo.mock.calls[0][0]).toMatchObject({ stepId: 'step-go' });
    expect(screen.getByText(a.added.undone)).toBeTruthy();
  });
});

describe('boughtRowsOf (pure)', () => {
  const t = ((key: string) => key) as never;
  const base = { costs: [], stops: [], sale: null, payoff: null, goal: null, formatMoney: fmt, formatDate: fmtDate };
  it('is empty with nothing to offer, and initialTicks ticks only the goal row', () => {
    expect(boughtRowsOf(t, base)).toEqual([]);
    const groups = boughtRowsOf(t, { ...base, goal: { id: 'g', name: 'G' }, sale: { amount: 100 } });
    expect(groups.map((g) => g.key)).toEqual(['money', 'goal']);
    expect(initialTicks(groups)).toEqual({ sale: false, goal: true });
  });
});
