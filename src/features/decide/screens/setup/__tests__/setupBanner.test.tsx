// 06.1-17: the three banner states, the no-close rule (D-10), and the checklist rows and Continue target (D31).
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { allNodes, expectFits } from '@/test/textFitMatrix';
import { setupProgress, type SetupFacts } from '../../logic/setupProgress';
import { SetupBanner } from '../SetupBanner';
import { SetupChecklist } from '../SetupChecklist';

let mockReduced = false;
jest.mock('@/theme/motion', () => ({ ...jest.requireActual('@/theme/motion'), useReduceMotion: () => mockReduced }));
const mockMarkSeen = jest.fn(() => Promise.resolve());
jest.mock('@/features/decide/hints/decideHints', () => ({ markSetupDoneSeen: (...a: unknown[]) => (mockMarkSeen as (...x: unknown[]) => unknown)(...a) }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));

const TODAY = '2026-11-20';
const NONE: SetupFacts = {
  hasPay: false, payAmountMinor: null, payDay: null,
  billsRightAnswered: false, billsCount: 0, billsMonthlyMinor: 0,
  debts: [], noDebtsAnswered: false,
  netSizeMinor: null, netNotSetAnswered: false,
  rulesOn: 0, noRulesAnswered: false,
  lastMonthComplete: false, newestEntryThisMonth: null, accountsAllHaveUse: false, recordsUpTo: '2026-11-15',
};
const FOUR: SetupFacts = {
  ...NONE, hasPay: true, payAmountMinor: 250000, payDay: 25, billsRightAnswered: true, billsCount: 3, billsMonthlyMinor: 120000,
  netNotSetAnswered: true, rulesOn: 2, debts: [{ name: 'Visa card', dueDay: null }],
};
const ALL: SetupFacts = {
  ...NONE, hasPay: true, payAmountMinor: 250000, payDay: 25, billsRightAnswered: true, noDebtsAnswered: true, netNotSetAnswered: true,
  noRulesAnswered: true, lastMonthComplete: true, accountsAllHaveUse: true, newestEntryThisMonth: TODAY,
};
const itemName = (id: string): string => ({ pay: 'Pay and payday', bills: 'Regular bills', debts: 'Debts', net: 'Safety net', rules: 'Your money rules', records: 'Records' })[id] ?? id;

async function banner(facts: SetupFacts, over: Partial<React.ComponentProps<typeof SetupBanner>> = {}) {
  const onStart = jest.fn();
  const onCheckFirst = jest.fn();
  const ui = (
    <SetupBanner progress={setupProgress(facts, TODAY)} onStart={onStart} onCheckFirst={onCheckFirst} setupDoneSeen={false} itemName={itemName} {...over} />
  );
  return { onStart, onCheckFirst, ...(await wrap(ui)) };
}

beforeEach(() => {
  mockMarkSeen.mockClear();
  mockReduced = false;
});

describe('SetupBanner', () => {
  it('state 1: new title, six-segment bar at 0, Start setup opens the first open item, Check a price first scrolls', async () => {
    const { onStart, onCheckFirst } = await banner(NONE);
    expect(screen.getByText('Set up Decide')).toBeTruthy();
    const bar = screen.getByTestId('setup-bar');
    expect(bar.props.accessibilityRole).toBe('progressbar');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 6, now: 0 });
    expect(screen.getAllByTestId('setup-segment-empty')).toHaveLength(6);
    await fireEvent.press(screen.getByText('Start setup'));
    expect(onStart).toHaveBeenCalledWith('pay');
    await fireEvent.press(screen.getByText('Check a price first'));
    expect(onCheckFirst).toHaveBeenCalled();
  });

  it('state 2: one-line row, count, next item, spoken label, bar value', async () => {
    const { onStart } = await banner(FOUR);
    expect(screen.getByText('Decide setup · 4 of 6 done')).toBeTruthy();
    expect(screen.getByText('Next: Debts · about 1 minute')).toBeTruthy();
    const row = screen.getByTestId('setup-banner-row');
    expect(row.props.accessibilityLabel).toBe('Decide setup, 4 of 6 done. Next: Debts.');
    expect(row.props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('setup-bar').props.accessibilityValue).toEqual({ min: 0, max: 6, now: 4 });
    expect(screen.getAllByTestId('setup-segment-filled')).toHaveLength(4);
    await fireEvent.press(row);
    expect(onStart).toHaveBeenCalledWith('debts');
  });

  it('state 3: says setup is done once, marks it seen, then renders nothing', async () => {
    const onSeeUses = jest.fn();
    await banner(ALL, { userId: 'u1', onSeeUses });
    expect(screen.getByText('Setup done. Answers use your records.')).toBeTruthy();
    await fireEvent.press(screen.getByText('See what Decide uses'));
    expect(mockMarkSeen).toHaveBeenCalledWith('u1');
    expect(onSeeUses).toHaveBeenCalled();
    expect(screen.queryByTestId('setup-banner-done')).toBeNull();
  });

  it('state 3 with the seen flag renders nothing', async () => {
    await banner(ALL, { setupDoneSeen: true });
    expect(screen.queryByTestId('setup-banner-done')).toBeNull();
    expect(screen.queryByTestId('setup-banner-row')).toBeNull();
    expect(screen.queryByTestId('setup-banner-new')).toBeNull();
  });

  it('state 3 without a user still hides after the link and tolerates a missing handler', async () => {
    await banner(ALL);
    await fireEvent.press(screen.getByText('See what Decide uses'));
    expect(mockMarkSeen).not.toHaveBeenCalled();
    expect(screen.queryByTestId('setup-banner-done')).toBeNull();
  });

  it('state 2 with no next item names none', async () => {
    const p = { ...setupProgress(FOUR, TODAY), next: null };
    await wrap(<SetupBanner progress={p} onStart={jest.fn()} onCheckFirst={jest.fn()} setupDoneSeen={false} itemName={itemName} />);
    expect(screen.getByText('Next:  · about 1 minute')).toBeTruthy();
  });

  it.each([
    ['new', NONE],
    ['row', FOUR],
    ['done', ALL],
  ])('has no close or snooze control in the %s state', async (_n, facts) => {
    await banner(facts);
    const labels = allNodes().filter((n) => typeof n.props.accessibilityLabel === 'string').map((n) => String(n.props.accessibilityLabel));
    expect(labels.filter((l) => /close|dismiss|snooze/i.test(l))).toEqual([]);
    expect(screen.queryByText(/close|dismiss|snooze|later|hide/i)).toBeNull();
  });

  it('draws the filled segments at once under Reduce Motion', async () => {
    mockReduced = true;
    await banner(FOUR);
    expect(screen.getAllByTestId('setup-segment-filled')).toHaveLength(4);
  });

  it('fits at large text', async () => {
    await banner(FOUR);
    screen.getByTestId('setup-banner-row');
    expectFits();
  });
});

describe('SetupChecklist', () => {
  async function checklist(facts: SetupFacts) {
    const onOpen = jest.fn();
    const onBack = jest.fn();
    const ui = <SetupChecklist progress={setupProgress(facts, TODAY)} currency="USD" onOpen={onOpen} onBack={onBack} />;
    return { onOpen, onBack, ...(await wrap(ui)) };
  }

  it('lists the six items with status, a count and a Continue button for the next open item', async () => {
    const { onOpen } = await checklist(FOUR);
    expect(screen.getByText('Decide setup')).toBeTruthy();
    expect(screen.getByText('4 of 6 done')).toBeTruthy();
    for (const id of ['pay', 'bills', 'debts', 'net', 'rules', 'records']) expect(screen.getByTestId(`setup-row-${id}`)).toBeTruthy();
    expect(screen.getByText('Your money rules')).toBeTruthy();
    expect(screen.getByText('Done · $2,500 on the 25th')).toBeTruthy();
    expect(screen.getByText('Done · 3 bills, $1,200 a month')).toBeTruthy();
    expect(screen.getByText('1 to finish · Visa card has no due day')).toBeTruthy();
    expect(screen.getByText('Done · not set yet')).toBeTruthy();
    expect(screen.getByText('Done · 2 rules')).toBeTruthy();
    expect(screen.getByText('Up to Nov 15, 2026 · add what you spent since')).toBeTruthy();
    expect(screen.getByText('Nothing here moves money. You can change any of it later.')).toBeTruthy();
    expect(screen.getAllByText('Done')).toHaveLength(4);
    await fireEvent.press(screen.getByText('Continue: Debts'));
    expect(onOpen).toHaveBeenCalledWith('/decide/setup/debts');
    await fireEvent.press(screen.getByTestId('setup-row-pay'));
    expect(onOpen).toHaveBeenCalledWith('/decide/setup/pay');
  });

  it('shows the other status lines: a debt due day, a sized net, no rules, no debts, records done', async () => {
    await checklist({ ...ALL, noDebtsAnswered: false, debts: [{ name: 'Car loan', dueDay: 3 }], netSizeMinor: 500000, noRulesAnswered: true, recordsUpTo: '2026-11-20' });
    expect(screen.getByText('Done · Car loan, due on the 3rd')).toBeTruthy();
    expect(screen.getByText('Done · $5,000, set in Grow')).toBeTruthy();
    expect(screen.getByText('Done · no rules')).toBeTruthy();
    expect(screen.getByText('Done · records up to Nov 20, 2026')).toBeTruthy();
  });

  it('when all are done it says Setup done and goes back to Decide', async () => {
    const { onBack } = await checklist(ALL);
    expect(screen.getByText('Setup done')).toBeTruthy();
    expect(screen.getByText('Done · no other debts')).toBeTruthy();
    expect(screen.queryByText(/^Continue:/)).toBeNull();
    await fireEvent.press(screen.getByText('Back to Decide'));
    expect(onBack).toHaveBeenCalled();
  });

  it('uses the one-bill wording and the open line for an item not started', async () => {
    await checklist({ ...NONE, billsRightAnswered: true, billsCount: 1, billsMonthlyMinor: 5000 });
    expect(screen.getByText('Done · 1 bill, $50 a month')).toBeTruthy();
    expect(screen.getAllByText('Not done yet').length).toBeGreaterThan(0);
  });

  it('fits at large text', async () => {
    await checklist(FOUR);
    screen.getByTestId('setup-row-pay');
    expectFits();
  });
});
