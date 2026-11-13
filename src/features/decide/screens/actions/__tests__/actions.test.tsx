// 06.1-26: Save for it (N18 / D64 / N18S) and I bought it (N19 / D63 / N19S, running-cost offers). Writes are mocked; the figures come
// from real engine runs (answer fixtures), so the target is the engine's own.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { judgeCheck, prepare, type CheckV2, type RunningCostLine } from '@/engine/decide/v3';
import { checkPlan } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { percent } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import { saveForItTarget } from '@/data/mutations/decideOutcome';
import en from '@/i18n/locales/en';
import { showToast } from '@/state/undoToast';
import { wrap } from '@/test/stepProps';
import { ledgerRun } from '../../answer/__tests__/fixtures';
import { BoughtScreen } from '../BoughtScreen';
import { RunningCostOffers } from '../RunningCostOffers';
import { SaveForItScreen } from '../SaveForItScreen';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
// 06.1-63: the frame is DetailScreen (its own tests cover the header, Back and insets); here it shows its title.
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

const mockSave = jest.fn();
const mockUndo = jest.fn();
const mockGoAhead = jest.fn();
const mockAddBill = jest.fn();
jest.mock('@/data/mutations/decideOutcome', () => ({
  ...jest.requireActual('@/data/mutations/decideOutcome'),
  useSaveForIt: () => ({ save: mockSave }),
}));
jest.mock('@/data/mutations/undo', () => ({ useUndo: () => ({ undo: mockUndo }) }));

const a = en.decide.screens.answerActions;
const TODAY = '2026-11-11';
const fmt = (n: number) => `$${n / 100}`;
const fmtDate = (d: string) => `on ${d}`;
const checkRef = { id: 'c1', created_by: 'u1', household_id: 'h1', name: 'Item', inputs: {} } as never;

const line = (id: string, on: boolean, amount = 5000): RunningCostLine => ({ id, amount: minorUnits(amount), everyMonths: 1, start: TODAY, end: null, on });

beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockResolvedValue({ reminder: 'none', stepId: 'step-1', goalId: 'goal-1' });
  mockGoAhead.mockReturnValue('step-go');
  mockAddBill.mockReturnValue('step-bill');
});

describe('SaveForItScreen', () => {
  const r = ledgerRun('N05');
  const props = (over: Partial<React.ComponentProps<typeof SaveForItScreen>> = {}): React.ComponentProps<typeof SaveForItScreen> => ({
    check: checkRef,
    v3: r.check,
    evaluation: r.evaluation,
    readyDate: () => '2027-03-31',
    currency: 'USD',
    today: TODAY,
    itemName: 'Item',
    formatMoney: fmt,
    formatDate: fmtDate,
    onSeeInGrow: jest.fn(),
    onBackToDecide: jest.fn(),
    ...over,
  });

  it('shows the engine target and ready month, and Make the goal calls useSaveForIt once', async () => {
    const p = props();
    await wrap(<SaveForItScreen {...p} />);
    const target = saveForItTarget(r.check, r.evaluation) as number;
    expect(screen.getByText(a.goal.toGo.replace('{{amount}}', fmt(target)))).toBeTruthy();
    expect(screen.getByText(a.goal.readyBy.replace('{{readyMonth}}', 'on 2027-03-31'))).toBeTruthy();
    await fireEvent.press(screen.getByText(a.goal.make));
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0]).toMatchObject({ v3: r.check, evaluation: r.evaluation, currency: 'USD', today: TODAY });
    expect(await screen.findByText(a.goalMade.title)).toBeTruthy();
  });

  it('Change the amount uses the picked monthly amount', async () => {
    await wrap(<SaveForItScreen {...props()} />);
    await fireEvent.press(screen.getByText(a.goal.changeAmount));
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThan(1);
    await fireEvent.press(radios[radios.length - 1] as never);
    const bigger = await screen.findByText(/^Use \$.* a month$/);
    await fireEvent.press(bigger);
    await fireEvent.press(screen.getByText(a.goal.make));
    const saved = mockSave.mock.calls[0][0].monthly as number;
    expect(saved).toBeGreaterThan(0);
  });

  it('a plan saves for the up-front part and says so', async () => {
    const base = ledgerRun('N05');
    const planCheck = checkPlan(60_000, { deposit: minorUnits(10_000), termMonths: 12, apr: percent('10'), firstPayment: { kind: 'one_period' } });
    const plan = { check: planCheck, evaluation: judgeCheck(prepare(base.inputs), planCheck) };
    expect(plan.check.pay.mode).toBe('plan');
    await wrap(<SaveForItScreen {...props({ v3: plan.check, evaluation: plan.evaluation })} />);
    expect(screen.getByText(a.goal.upFrontOnly)).toBeTruthy();
    const target = saveForItTarget(plan.check, plan.evaluation);
    expect(target).toBe(plan.evaluation.purchase?.dayOne ?? null);
    expect(target).not.toBe(plan.evaluation.purchase?.whole);
  });

  it('Undo after the goal is made calls one undo for the step', async () => {
    await wrap(<SaveForItScreen {...props()} />);
    await fireEvent.press(screen.getByText(a.goal.make));
    await fireEvent.press(await screen.findByText(en.decide.screens.common.undo));
    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockUndo.mock.calls[0][0]).toMatchObject({ stepId: 'step-1', householdId: 'h1' });
    expect(screen.getByText(a.added.undone)).toBeTruthy();
  });

  it('06.1-63 (CB-4, CN-8): sits in the "Save for it" frame, and Goal made keeps it', async () => {
    await wrap(<SaveForItScreen {...props()} />);
    expect(screen.getByTestId('detail-title').props.children).toBe(a.bar.saveForIt);
    await fireEvent.press(screen.getByText(a.goal.make));
    expect(await screen.findByText(a.goalMade.title)).toBeTruthy();
    expect(screen.getByTestId('detail-title').props.children).toBe(a.bar.saveForIt);
  });

  it('06.1-63 (CB-14, T-06.1-63-01): Make the goal is pending while it runs and ignores a second tap', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockSave.mockReturnValue(new Promise((done) => (resolve = done)));
    await wrap(<SaveForItScreen {...props()} />);
    await fireEvent.press(screen.getByText(a.goal.make));
    const pill = screen.getByRole('button', { name: a.goal.make });
    expect(pill.props.accessibilityState).toMatchObject({ busy: true });
    await fireEvent.press(screen.getByText(a.goal.make));
    expect(mockSave).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ reminder: 'none', stepId: 'step-1', goalId: 'goal-1' });
    });
    expect(await screen.findByText(a.goalMade.title)).toBeTruthy();
  });

  it('06.1-63 (CF-6, T-06.1-63-02): a failed save shows a toast, no Goal made, and the button works again', async () => {
    mockSave.mockRejectedValueOnce(new Error('offline'));
    await wrap(<SaveForItScreen {...props()} />);
    await act(async () => {
      fireEvent.press(screen.getByText(a.goal.make));
    });
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ text: { key: 'decide.screens.answerActions.save.failed' } }));
    expect(screen.queryByText(a.goalMade.title)).toBeNull();
    const pill = screen.getByRole('button', { name: a.goal.make });
    expect(pill.props.accessibilityState?.busy).not.toBe(true);
    await fireEvent.press(screen.getByText(a.goal.make));
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(a.goalMade.title)).toBeTruthy();
  });

  it('06.1-63 (CS-9): Goal made says the reminder is set, on the engine ready date', async () => {
    mockSave.mockResolvedValue({ reminder: 'set', stepId: 'step-1', goalId: 'goal-1' });
    const evaluation = { ...r.evaluation, result: { ...r.evaluation.result, readyBy: { kind: 'date', date: '2027-03-31' } } } as never;
    await wrap(<SaveForItScreen {...props({ evaluation })} />);
    await fireEvent.press(screen.getByText(a.goal.make));
    expect(await screen.findByText(a.save.reminderSet.replace('{{date}}', 'on 2027-03-31'))).toBeTruthy();
  });

  it('06.1-63 (CS-9): a month ready date reminds on the first of the month', async () => {
    mockSave.mockResolvedValue({ reminder: 'set', stepId: 'step-1', goalId: 'goal-1' });
    const evaluation = { ...r.evaluation, result: { ...r.evaluation.result, readyBy: { kind: 'month', month: '2027-04' } } } as never;
    await wrap(<SaveForItScreen {...props({ evaluation })} />);
    await fireEvent.press(screen.getByText(a.goal.make));
    expect(await screen.findByText(a.save.reminderSet.replace('{{date}}', 'on 2027-04-01'))).toBeTruthy();
  });

  it('06.1-63 (CS-9): Goal made says reminders are off', async () => {
    mockSave.mockResolvedValue({ reminder: 'off', stepId: 'step-1', goalId: 'goal-1' });
    await wrap(<SaveForItScreen {...props()} />);
    await fireEvent.press(screen.getByText(a.goal.make));
    expect(await screen.findByText(a.save.reminderOff)).toBeTruthy();
  });

  it('06.1-63 (CS-9): no reminder line when there was no date to remind on', async () => {
    await wrap(<SaveForItScreen {...props()} />);
    await fireEvent.press(screen.getByText(a.goal.make));
    expect(await screen.findByText(a.goalMade.title)).toBeTruthy();
    expect(screen.queryByTestId('goal-made-reminder')).toBeNull();
  });

  it('06.1-63: with nothing to save for, Back to the answer goes back to the answer', async () => {
    const onBackToAnswer = jest.fn();
    const p = props({ evaluation: { ...r.evaluation, purchase: null } as never, onBackToAnswer });
    await wrap(<SaveForItScreen {...p} />);
    await fireEvent.press(screen.getByText(en.decide.screens.common.backToAnswer));
    expect(onBackToAnswer).toHaveBeenCalledTimes(1);
    expect(p.onBackToDecide).not.toHaveBeenCalled();
  });

  it('See it in Grow hands over the returned goal id', async () => {
    const p = props();
    await wrap(<SaveForItScreen {...p} />);
    await fireEvent.press(screen.getByText(a.goal.make));
    await fireEvent.press(await screen.findByText(a.goalMade.seeInGrow));
    expect(p.onSeeInGrow).toHaveBeenCalledWith('goal-1');
  });
});

describe('BoughtScreen', () => {
  const r = ledgerRun('N02');
  const withCosts = (lines: RunningCostLine[]): CheckV2 => ({ ...r.check, runningCosts: lines });
  const props = (v3: CheckV2 = r.check): React.ComponentProps<typeof BoughtScreen> => ({
    addBill: mockAddBill,
    goAhead: mockGoAhead,
    checkId: 'c1',
    ownerId: 'u1',
    householdId: 'h1',
    homeCurrency: 'USD',
    currency: 'USD',
    timeZone: 'UTC',
    today: TODAY,
    itemName: 'Item',
    v3,
    evaluation: r.evaluation,
    accounts: [{ id: 'acc-1', name: 'Everyday' }],
    formatMoney: fmt,
    formatDate: fmtDate,
    onDone: jest.fn(),
  });

  it('says no payment is made and no money moves', async () => {
    await wrap(<BoughtScreen {...props()} />);
    expect(screen.getByTestId('no-money-moves')).toBeTruthy();
    expect(screen.getByText(a.bought.sub)).toBeTruthy();
    expect(a.bought.sub).toContain('No payment is made and no money moves');
  });

  it('writes once on Add to records and never adds a bill before a tap', async () => {
    await wrap(<BoughtScreen {...props(withCosts([line('r1', true)]))} />);
    await fireEvent.press(screen.getByText(a.bought.add));
    expect(mockGoAhead).toHaveBeenCalledTimes(1);
    expect(mockGoAhead.mock.calls[0][0]).toMatchObject({ checkId: 'c1', accountId: 'acc-1', homeCurrency: 'USD' });
    expect(await screen.findByText(a.added.title)).toBeTruthy();
    expect(mockAddBill).not.toHaveBeenCalled();
  });

  it('Skip adds nothing, Add as a bill adds one series, and off lines are never offered', async () => {
    await wrap(<BoughtScreen {...props(withCosts([line('r1', true, 5000), line('r2', false, 7000), line('r3', true, 9000)]))} />);
    await fireEvent.press(screen.getByText(a.bought.add));
    // First offer: skip.
    expect(await screen.findByText(/running cost, \$50 a month/)).toBeTruthy();
    await fireEvent.press(screen.getByText(a.runningCost.skip));
    expect(mockAddBill).not.toHaveBeenCalled();
    // Second offer is r3 (r2 is off): add it.
    expect(await screen.findByText(/running cost, \$90 a month/)).toBeTruthy();
    expect(screen.queryByText(/\$70/)).toBeNull();
    await fireEvent.press(screen.getByText(a.runningCost.add));
    expect(mockAddBill).toHaveBeenCalledTimes(1);
    expect(mockAddBill.mock.calls[0][0].line.id).toBe('r3');
    expect(await screen.findByText(a.runningCost.done)).toBeTruthy();
  });

  it('06.1-63 (CB-4, CN-8): sits in the "I bought it" frame, before and after adding', async () => {
    await wrap(<BoughtScreen {...props()} />);
    expect(screen.getByTestId('detail-title').props.children).toBe(a.bar.bought);
    await fireEvent.press(screen.getByText(a.bought.add));
    expect(await screen.findByText(a.added.title)).toBeTruthy();
    expect(screen.getByTestId('detail-title').props.children).toBe(a.bar.bought);
  });

  it('06.1-63 (CB-9): while accounts load it says so, not the no-account alert; late accounts pick the first', async () => {
    const view = await wrap(<BoughtScreen {...props()} accounts={[]} accountsLoading />);
    expect(screen.getByText(a.bought.loadingAccounts)).toBeTruthy();
    expect(screen.queryByText(a.bought.noAccount)).toBeNull();
    await fireEvent.press(screen.getByText(a.bought.add));
    expect(mockGoAhead).not.toHaveBeenCalled();
    await view.rerender(<BoughtScreen {...props()} accounts={[{ id: 'acc-2', name: 'Late' }, { id: 'acc-3', name: 'Other' }]} />);
    expect(screen.queryByText(a.bought.loadingAccounts)).toBeNull();
    expect(screen.getByRole('radio', { name: 'Late' }).props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByText(a.bought.add));
    expect(mockGoAhead.mock.calls[0][0]).toMatchObject({ accountId: 'acc-2' });
  });

  it('06.1-63 (CB-9): with no account after loading, the no-account alert shows', async () => {
    await wrap(<BoughtScreen {...props()} accounts={[]} />);
    expect(screen.getByText(a.bought.noAccount)).toBeTruthy();
  });

  it('06.1-63: a picked account is used, and the first again if the pick goes away', async () => {
    const two = [{ id: 'acc-1', name: 'Everyday' }, { id: 'acc-2', name: 'Second' }];
    const view = await wrap(<BoughtScreen {...props()} accounts={two} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Second' }));
    expect(screen.getByRole('radio', { name: 'Second' }).props.accessibilityState).toMatchObject({ selected: true });
    await view.rerender(<BoughtScreen {...props()} accounts={[{ id: 'acc-1', name: 'Everyday' }]} />);
    expect(screen.getByRole('radio', { name: 'Everyday' }).props.accessibilityState).toMatchObject({ selected: true });
  });

  it('Undo after adding calls one undo and says nothing was added', async () => {
    await wrap(<BoughtScreen {...props()} />);
    await fireEvent.press(screen.getByText(a.bought.add));
    await fireEvent.press(await screen.findByText(en.decide.screens.common.undo));
    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockUndo.mock.calls[0][0]).toMatchObject({ stepId: 'step-go' });
    expect(screen.getByText(a.added.undone)).toBeTruthy();
  });
});

describe('RunningCostOffers', () => {
  it('offers nothing when every line is off', async () => {
    await wrap(
      <RunningCostOffers addBill={mockAddBill} lines={[line('r1', false)]} itemName="Item" categoryId={null} ownerId="u1" householdId="h1" accountId="acc-1" currency="USD" timeZone="UTC" formatMoney={fmt} onDone={jest.fn()} />,
    );
    expect(screen.queryByTestId('running-cost-offer')).toBeNull();
  });
});
