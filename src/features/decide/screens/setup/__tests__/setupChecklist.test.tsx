// 06.1-50 (A-SU-1): the checklist always has a Back in its top bar, not only "Back to Decide" when all six are done.
// 06.1-54 (C-20, DS-20, A-SU-2, A-SU-3): loading and error states never show a count; the bar fills from the done count; Pay and
// Net rows say why.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { setupProgress, type SetupFacts } from '../../logic/setupProgress';
import { SetupChecklist } from '../SetupChecklist';

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
  readinessOpen: 0, readinessFirst: null,
};
const TWO: SetupFacts = { ...NONE, hasPay: true, payAmountMinor: 250000, payDay: 25, billsRightAnswered: true, billsCount: 3, billsMonthlyMinor: 120000 };
const ALL: SetupFacts = {
  ...NONE, hasPay: true, payAmountMinor: 250000, payDay: 25, billsRightAnswered: true, noDebtsAnswered: true, netNotSetAnswered: true,
  noRulesAnswered: true, lastMonthComplete: true, accountsAllHaveUse: true, newestEntryThisMonth: TODAY,
};

async function checklist(facts: SetupFacts) {
  const onOpen = jest.fn();
  const onBack = jest.fn();
  await wrap(<SetupChecklist progress={setupProgress(facts, TODAY)} currency="USD" onOpen={onOpen} onBack={onBack} />);
  return { onOpen, onBack };
}

describe('SetupChecklist Back (A-SU-1)', () => {
  it('with 2 of 6 done, the top-bar Back leaves setup', async () => {
    const { onBack, onOpen } = await checklist(TWO);
    expect(screen.getByText('2 of 6 done')).toBeTruthy();
    expect(screen.queryByText('Back to Decide')).toBeNull();
    const back = screen.getByTestId('checklist-back');
    expect(back.props.accessibilityLabel).toBe('Back');
    await fireEvent.press(back);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('with nothing done, Back is still there', async () => {
    const { onBack } = await checklist(NONE);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('when all are done, both the top-bar Back and the Back to Decide button leave setup', async () => {
    const { onBack } = await checklist(ALL);
    await fireEvent.press(screen.getByTestId('checklist-back'));
    await fireEvent.press(screen.getByText('Back to Decide'));
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});

const EMPTY_PROGRESS = { items: [], doneCount: 0, next: null, allDone: false };

describe('SetupChecklist while reading (C-20)', () => {
  it('says it is loading, with no count and no Back to Decide', async () => {
    const onBack = jest.fn();
    await wrap(<SetupChecklist progress={{ ...EMPTY_PROGRESS, loading: true, error: false }} currency="USD" onOpen={jest.fn()} onBack={onBack} />);
    expect(screen.getByText('Loading your setup…')).toBeTruthy();
    expect(screen.queryByText(/of 6/)).toBeNull();
    expect(screen.queryByText('Back to Decide')).toBeNull();
    expect(screen.queryByTestId('setup-bar')).toBeNull();
    await fireEvent.press(screen.getByTestId('checklist-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('a failed read shows the error card, and its button reads again', async () => {
    const retry = jest.fn();
    await wrap(<SetupChecklist progress={{ ...EMPTY_PROGRESS, loading: false, error: true, retry }} currency="USD" onOpen={jest.fn()} onBack={jest.fn()} />);
    expect(screen.getByTestId('answer-error')).toBeTruthy();
    expect(screen.queryByText(/of 6/)).toBeNull();
    expect(screen.queryByText('Back to Decide')).toBeNull();
    await fireEvent.press(screen.getByText('Try the check again'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('an error with no retry given does nothing on press', async () => {
    await wrap(<SetupChecklist progress={{ ...EMPTY_PROGRESS, error: true }} currency="USD" onOpen={jest.fn()} onBack={jest.fn()} />);
    await fireEvent.press(screen.getByText('Try the check again'));
    expect(screen.getByTestId('answer-error')).toBeTruthy();
  });

  it('with no state flags and nothing read, it still says loading', async () => {
    await wrap(<SetupChecklist progress={EMPTY_PROGRESS} currency="USD" onOpen={jest.fn()} onBack={jest.fn()} />);
    expect(screen.getByTestId('setup-loading')).toBeTruthy();
  });
});

describe('SetupChecklist bar (DS-20)', () => {
  it.each([[NONE, 0], [TWO, 2], [{ ...TWO, noDebtsAnswered: true }, 3], [ALL, 6]])('fills one segment per done item on the first render', async (facts, done) => {
    await checklist(facts as SetupFacts);
    expect(screen.getByText(`${done} of 6 done`)).toBeTruthy();
    expect(screen.queryAllByTestId('setup-segment-filled')).toHaveLength(done as number);
    expect(screen.queryAllByTestId('setup-segment-empty')).toHaveLength(6 - (done as number));
    expect(screen.getByTestId('setup-bar').props.accessibilityValue).toEqual({ min: 0, max: 6, now: done });
  });
});

describe('SetupChecklist Pay and Net rows (A-SU-2, A-SU-3)', () => {
  it('Pay found but how you are paid not set says so; no pay at all says so', async () => {
    await checklist({ ...NONE, payAmountMinor: 320000, payDay: 15, payTypesSet: false });
    expect(screen.getByText('How you’re paid isn’t set yet')).toBeTruthy();
  });

  it('no pay says no pay set yet', async () => {
    await checklist(NONE);
    expect(screen.getByText('No pay set yet')).toBeTruthy();
  });

  it('the net row shows the money in the net with the goal second', async () => {
    await checklist({ ...NONE, netSizeMinor: 500000, netSavedMinor: 5000 });
    expect(screen.getByText('$50 in it · goal $5,000')).toBeTruthy();
  });
});
