import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { Step5Decision, largestAccountId, type Step5Props } from '../Step5Decision';
import { buy, stepProps, wrap } from './helpers/stepProps';
import type { CheckInputs } from '../../../snapshot/types';
import { loggedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticSuccess: jest.fn(), hapticWarning: jest.fn(), hapticLight: jest.fn(), hapticMedium: jest.fn() }));

// Step 5 imports the goal-progress data hooks (05-46); they are only called for a decided Waiting check.
jest.mock('@/data/queries/decide', () => ({ useSavingsGoals: jest.fn(), useGoalLines: jest.fn() }));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: jest.fn() }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: jest.fn() }));

const CASH = [
  { id: 'a1', name: 'Everyday', balance: 200_000 },
  { id: 'a2', name: 'Savings pot', balance: 900_000 },
];

function props(over: Partial<CheckInputs> = {}, extra: Partial<Step5Props> = {}, source = loggedSource()): Step5Props {
  return { ...stepProps(buy(over), {}, source), cashAccounts: CASH, investAccounts: [], written: { transferCategoryAvailable: true, endedSeriesIds: [] }, ...extra };
}

describe('Step5Decision', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the plan card, three outcomes and the empty written heading', async () => {
    await wrap(<Step5Decision {...props()} />);
    expect(screen.getByText('The plan on the table')).toBeTruthy();
    expect(screen.getByText('$1500 · Paid in full')).toBeTruthy();
    expect(screen.getByLabelText('Go ahead')).toBeTruthy();
    expect(screen.getByLabelText('Wait and save')).toBeTruthy();
    expect(screen.getByLabelText('Pass')).toBeTruthy();
    expect(screen.getByText('Nothing is written yet')).toBeTruthy();
  });

  it('choosing an outcome writes inputs.outcome', async () => {
    const p = props();
    await wrap(<Step5Decision {...p} />);
    await fireEvent.press(screen.getByLabelText('Pass'));
    expect(p.update).toHaveBeenCalledWith({ outcome: 'pass' });
    await fireEvent.press(screen.getByLabelText('Wait and save'));
    expect(p.update).toHaveBeenCalledWith({ outcome: 'wait' });
  });

  it('a fitting check carries no flag on Go ahead', async () => {
    await wrap(<Step5Decision {...props()} />);
    expect(screen.queryByText('Breaks a line')).toBeNull();
  });

  it('a non-fitting check flags Go ahead as breaking a line', async () => {
    const p = props({ advertised: 3_000_000, method: 'cash' });
    await wrap(<Step5Decision {...p} />);
    expect(screen.getByText('Breaks a line')).toBeTruthy();
  });

  it('a short month changes the Go ahead description', async () => {
    const p = props({ advertised: 3_000_000, method: 'loan', loan: { deposit: 0, termMonths: 12, aprText: '10', secured: false, securedTouched: true, aprFromQuick: false, promo: null, variable: false } });
    await wrap(<Step5Decision {...p} />);
    expect(screen.getByText(/Logs it anyway\. The record will show the month was \$\d+ short when you signed\./)).toBeTruthy();
  });

  it('Pass lists its three lines', async () => {
    await wrap(<Step5Decision {...props({ outcome: 'pass' })} />);
    expect(screen.getByText('What gets written')).toBeTruthy();
    expect(screen.getByText('Kept in Past decisions with the price and your reason.')).toBeTruthy();
    expect(screen.getByText('No reminders. It stays until you delete it.')).toBeTruthy();
  });

  it('Wait shows the amount, the ready-by date and the closing line about nothing else changing', async () => {
    const p = props({ outcome: 'wait', advertised: 2_000_000, method: 'cash' });
    await wrap(<Step5Decision {...p} />);
    expect(screen.getByText('Put aside a month')).toBeTruthy();
    expect(screen.getByText('Ready by')).toBeTruthy();
    expect(screen.getByLabelText('Monthly saving')).toBeTruthy();
    expect(screen.getByText('Nothing else changes: no balance or limit moves until you reopen it.')).toBeTruthy();
    expect(screen.queryByText(/twelve months/)).toBeNull();
  });

  it('the Wait slider steps in 2500 minor units and writes inputs.wait', async () => {
    const p = props({ outcome: 'wait', advertised: 2_000_000, method: 'cash', wait: { monthlyAmount: 50_000 } });
    await wrap(<Step5Decision {...p} />);
    const slider = screen.getByLabelText('Monthly saving');
    expect(slider.props.accessibilityValue.min).toBe(2_500);
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(p.update).toHaveBeenCalledWith({ wait: { monthlyAmount: 52_500 } });
  });

  it('WR-C07: the Wait slider follows the live amount while the plan is still settling', async () => {
    const settled = props({ outcome: 'wait', advertised: 2_000_000, method: 'cash', wait: { monthlyAmount: 50_000 } });
    const p = { ...settled, inputs: { ...settled.inputs, wait: { monthlyAmount: 55_000 } } };
    await wrap(<Step5Decision {...p} />);
    const slider = screen.getByLabelText('Monthly saving');
    expect(slider.props.accessibilityValue.now).toBe(55_000);
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(p.update).toHaveBeenCalledWith({ wait: { monthlyAmount: 57_500 } });
  });

  it('a Wait amount above what is spare is said plainly', async () => {
    const spare = props({ outcome: 'wait', advertised: 2_000_000, method: 'cash' }).computation.waitPlan!.spareMonthly;
    const p = props({ outcome: 'wait', advertised: 2_000_000, method: 'cash', wait: { monthlyAmount: spare + 10_000 } });
    await wrap(<Step5Decision {...p} />);
    expect(screen.getByText(/is more than you actually have spare — something else has to give\./)).toBeTruthy();
  });

  it('IN-C04: a decided check with no need-by date lists its writes on the decision date', async () => {
    const p = props({ outcome: 'go', needBy: null, goAccountId: 'a2' }, { readOnly: true, decidedOn: '2026-09-03' });
    await wrap(<Step5Decision {...p} />);
    expect(screen.getByText('A pending expense of $1500.00 on on 2026-09-03, in Savings pot.')).toBeTruthy();
  });

  it('Go ahead on cash lists the pending expense in the largest account by default', async () => {
    const p = props({ outcome: 'go', needBy: '2026-11-20' });
    await wrap(<Step5Decision {...p} />);
    expect(p.update).toHaveBeenCalledWith({ goAccountId: 'a2' });
    expect(screen.getByText('Paid from')).toBeTruthy();
    expect(screen.getByText('A pending expense of $1500.00 on on 2026-11-20, in Savings pot.')).toBeTruthy();
    expect(screen.getByText('Your saving and investing continue untouched.')).toBeTruthy();
  });

  it('CR-C05: a stored paying account that is no longer offered is replaced by the largest one', async () => {
    const p = props({ outcome: 'go', needBy: '2026-11-20', goAccountId: 'archived' });
    await wrap(<Step5Decision {...p} />);
    expect(p.update).toHaveBeenCalledWith({ goAccountId: 'a2' });
    expect(screen.getByText('A pending expense of $1500.00 on on 2026-11-20, in Savings pot.')).toBeTruthy();
  });

  it('picking another paying account writes goAccountId', async () => {
    const p = props({ outcome: 'go', goAccountId: 'a2' });
    await wrap(<Step5Decision {...p} />);
    await fireEvent.press(screen.getByLabelText('Everyday'));
    expect(p.update).toHaveBeenCalledWith({ goAccountId: 'a1' });
  });

  it('an invest lump offers Into and writes investAccountId', async () => {
    const extra = { investAccounts: [{ id: 'i1', name: 'Brokerage', currency: 'USD' }, { id: 'i2', name: 'Euro fund', currency: 'EUR' }] };
    const p = props({ kind: 'invest', outcome: 'go', method: 'lump', advertised: 100_000, goAccountId: 'a2' }, extra);
    await wrap(<Step5Decision {...p} />);
    expect(screen.getByText('Into')).toBeTruthy();
    expect(screen.getByLabelText('Not into an account you track')).toBeTruthy();
    expect(screen.queryByLabelText('Euro fund')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Brokerage'));
    expect(p.update).toHaveBeenCalledWith({ investAccountId: 'i1' });
    expect(screen.getByText(/A pending payment of \$1000\.00 on on .*, from Savings pot\./)).toBeTruthy();
  });

  it('an invest lump into a tracked account lists a pending transfer', async () => {
    const extra = { investAccounts: [{ id: 'i1', name: 'Brokerage', currency: 'USD' }] };
    const p = props({ kind: 'invest', outcome: 'go', method: 'lump', advertised: 100_000, goAccountId: 'a2', investAccountId: 'i1' }, extra);
    await wrap(<Step5Decision {...p} />);
    expect(screen.getByText(/A pending transfer of \$1000\.00 on on .*, from Savings pot to Brokerage\./)).toBeTruthy();
  });

  it('there is no Into row when no tracked investment account shares the currency', async () => {
    const p = props({ kind: 'invest', outcome: 'go', method: 'lump', advertised: 100_000 }, { investAccounts: [{ id: 'i2', name: 'Euro fund', currency: 'EUR' }] });
    await wrap(<Step5Decision {...p} />);
    expect(screen.queryByText('Into')).toBeNull();
  });

  it('a decided check disables the choices', async () => {
    const p = { ...props({ outcome: 'pass' }), readOnly: true };
    const view = await wrap(<Step5Decision {...p} />);
    expect(JSON.stringify(view.toJSON())).toContain('"pointerEvents":"none"');
    expect(p.update).not.toHaveBeenCalled();
  });

  it('largestAccountId picks the biggest balance and handles none', () => {
    expect(largestAccountId(CASH)).toBe('a2');
    expect(largestAccountId([])).toBeNull();
  });

  it('never says should or advice', async () => {
    const view = await wrap(<Step5Decision {...props({ outcome: 'go' })} />);
    const text = JSON.stringify(view.toJSON()).toLowerCase();
    expect(text).not.toContain('should');
    expect(text).not.toContain('advice');
  });
});
