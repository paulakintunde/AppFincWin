// 06.1-50 (A-SU-1): the checklist always has a Back in its top bar, not only "Back to Decide" when all six are done.
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
