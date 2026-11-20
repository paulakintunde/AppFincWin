// 08.1-10 (carry-over 08-29, ENG-26): the checklist ends with "Who do you share money with?", opening Household. It is not a setup
// item: no done tick, and the progress count is unchanged.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { setupProgress, SETUP_ORDER, type SetupFacts } from '../../logic/setupProgress';
import { SetupChecklist } from '../SetupChecklist';

jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticTick: jest.fn() }));

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
const ALL: SetupFacts = {
  ...NONE, hasPay: true, payAmountMinor: 250000, payDay: 25, billsRightAnswered: true, noDebtsAnswered: true, netNotSetAnswered: true,
  noRulesAnswered: true, lastMonthComplete: true, accountsAllHaveUse: true, newestEntryThisMonth: TODAY,
};

async function checklist(facts: SetupFacts) {
  const onOpen = jest.fn();
  await wrap(<SetupChecklist progress={setupProgress(facts, TODAY)} currency="USD" onOpen={onOpen} onBack={jest.fn()} />);
  return { onOpen };
}

describe('the household row at the end of the setup checklist', () => {
  it('is the last row, reads "Who do you share money with?" and opens /household', async () => {
    const { onOpen } = await checklist(NONE);
    const row = screen.getByTestId('setup-row-household');
    expect(row.props.accessibilityLabel).toBe('Who do you share money with?');
    expect(screen.getByText('Who do you share money with?')).toBeTruthy();
    await fireEvent.press(row);
    expect(onOpen).toHaveBeenCalledWith('/household');
    // after the six setup rows
    const ids = SETUP_ORDER.map((id) => `setup-row-${id}`);
    for (const id of ids) expect(screen.getByTestId(id)).toBeTruthy();
  });

  it('never gets a done tick, even with every setup item done', async () => {
    await checklist(ALL);
    expect(screen.getByTestId('setup-row-household')).toBeTruthy();
    expect(screen.queryByTestId('setup-done-household')).toBeNull();
  });

  it('does not change the progress count or the bar', async () => {
    await checklist(NONE);
    expect(screen.getByText('0 of 6 done')).toBeTruthy();
    expect(screen.getAllByTestId('setup-segment-empty')).toHaveLength(6);
    expect(setupProgress(NONE, TODAY).items).toHaveLength(6);
    expect(setupProgress(NONE, TODAY).doneCount).toBe(0);
  });
});
