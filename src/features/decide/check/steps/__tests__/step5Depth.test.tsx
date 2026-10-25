import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { Step5Decision, type Step5Props } from '../Step5Decision';
import { buy, stepProps, wrap } from './helpers/stepProps';
import type { CheckInputs } from '../../../snapshot/types';
import { loggedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticSuccess: jest.fn(), hapticWarning: jest.fn(), hapticLight: jest.fn(), hapticMedium: jest.fn() }));

const mockGoals = jest.fn();
const mockLines = jest.fn();
jest.mock('@/data/queries/decide', () => ({
  useSavingsGoals: (...a: unknown[]) => mockGoals(...a),
  useGoalLines: (...a: unknown[]) => mockLines(...a),
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD' }),
}));

const CASH = [{ id: 'a1', name: 'Everyday', balance: 200_000 }];

function props(over: Partial<CheckInputs> = {}, extra: Partial<Step5Props> = {}): Step5Props {
  return { ...stepProps(buy(over), {}, loggedSource()), cashAccounts: CASH, investAccounts: [], written: { transferCategoryAvailable: true, endedSeriesIds: [] }, ...extra };
}

const SPREAD: Partial<CheckInputs> = { advertised: 9_000_000, method: 'cash' };

function sizeOf(p: Step5Props): string | null {
  return p.computation.verdict?.size ?? null;
}

describe('Step5Decision cooling-off and Wait goal (05-46)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGoals.mockReturnValue({ data: [] });
    mockLines.mockReturnValue({ data: [] });
  });

  it('a needs-spreading purchase offers the toggle, off by default, and it writes coolingOff', async () => {
    const p = props(SPREAD);
    expect(sizeOf(p)).toBe('needs_spreading');
    await wrap(<Step5Decision {...p} />);
    const toggle = screen.getByLabelText('Check again in 48 hours');
    expect(toggle.props.accessibilityState.checked).toBe(false);
    expect(screen.getByText('Reopens this check, recalculated. Off unless you turn it on.')).toBeTruthy();
    await fireEvent.press(toggle);
    expect(p.update).toHaveBeenCalledWith({ coolingOff: true });
  });

  it('the toggle is absent for a purchase that fits the spare', async () => {
    const p = props();
    expect(sizeOf(p)).not.toBe('needs_spreading');
    await wrap(<Step5Decision {...p} />);
    expect(screen.queryByLabelText('Check again in 48 hours')).toBeNull();
  });

  it('the toggle is disabled on a decided check', async () => {
    await wrap(<Step5Decision {...props({ ...SPREAD, coolingOff: true }, {})} readOnly />);
    expect(screen.getByLabelText('Check again in 48 hours').props.accessibilityState.disabled).toBe(true);
  });

  it('when on, What gets written ends with the reminder, for Pass too', async () => {
    await wrap(<Step5Decision {...props({ ...SPREAD, coolingOff: true, outcome: 'pass' })} />);
    expect(screen.getByText('A reminder in 48 hours that reopens this check, recalculated.')).toBeTruthy();
  });

  it('Wait previews the goal with a bar at zero', async () => {
    const p = props({ ...SPREAD, outcome: 'wait' });
    expect(p.computation.waitPlan?.target ?? 0).toBeGreaterThan(0);
    await wrap(<Step5Decision {...p} />);
    expect(screen.getAllByText(/A pot of \$\d+/).length).toBeGreaterThan(0);
    expect(screen.getByText(/\$0 of \$\d+ saved/)).toBeTruthy();
  });

  it('a decided Waiting check shows its goal progress from the tagged transfers', async () => {
    const p = props({ ...SPREAD, outcome: 'wait' }, { checkId: 'c1', checkStatus: 'waiting' });
    mockGoals.mockReturnValue({
      data: [{ id: 'g1', check_id: 'c1', deleted_at: null, currency: 'USD', target: 900_000, monthly_amount: 30_000, ready_by: null, opening_saved: 0 }],
    });
    mockLines.mockReturnValue({ data: [{ goal_id: 'g1', status: 'paid', deleted_at: null, home_currency: 'USD', home_amount: -50_000 }] });
    await wrap(<Step5Decision {...p} readOnly />);
    expect(mockGoals).toHaveBeenCalled();
    expect(screen.getByText('$500 of $9000 saved')).toBeTruthy();
  });

  it('a decided Waiting check with no goal shows no progress', async () => {
    await wrap(<Step5Decision {...props({ ...SPREAD, outcome: 'wait' }, { checkId: 'c1', checkStatus: 'waiting' })} readOnly />);
    expect(screen.queryByText(/of \$\d+ saved$/)).toBeNull();
  });

  it('a check that is not waiting never reads goals', async () => {
    await wrap(<Step5Decision {...props({ ...SPREAD, outcome: 'wait' }, { checkId: 'c1', checkStatus: 'passed' })} readOnly />);
    expect(mockGoals).not.toHaveBeenCalled();
  });
});
