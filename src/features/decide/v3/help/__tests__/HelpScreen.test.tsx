/** Plan 05.3-31 (DSV-12): the Help me check this form prefills, saves the five rough_* figures and returns. */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { HelpScreen, prefillOf } from '../HelpScreen';
import { roughInputs } from './helpKit';
import { returnToTab } from '@/shell/navigation/returnToTab';

jest.setTimeout(60000);

const mockBack = jest.fn();
const mockNavigate = jest.fn();
const mockUpdate = jest.fn();
const mockTrack = jest.fn();
jest.mock('expo-router', () => ({ useRootNavigationState: () => undefined, router: { back: () => mockBack(), navigate: (h: unknown) => mockNavigate(h) } }));
jest.mock('@/shell/navigation/returnToTab', () => ({ returnToTab: jest.fn() }));
jest.mock('@/shell/screen/DetailScreen', () => ({ DetailScreen: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: null }) }));
jest.mock('@/data/mutations/decideSettings', () => ({ useUpdateDecideSettings: () => ({ update: (p: unknown) => mockUpdate(p) }) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', homeCurrency: 'USD' }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));


beforeEach(() => jest.clearAllMocks());

describe('prefillOf', () => {
  it('sums this month paid lines and ignores pending ones', () => {
    const r = prefillOf(roughInputs());
    expect(r.fromRecords).toBe(true);
    expect(r.figures).toEqual({ income: 300000, spent: 100000, saving: null, debt: 15000, invest: null });
  });
  it('falls back to stored rough figures with no month lines', () => {
    const rough = { income: 5000, expenses: 4000, saving: 300, debt: 200, invest: 100, asOf: '2026-10-01' } as never;
    const r = prefillOf(roughInputs({ lines: [], rough }));
    expect(r.fromRecords).toBe(false);
    expect(r.figures).toEqual({ income: 5000, spent: 4000, saving: 300, debt: 200, invest: 100 });
  });
});

describe('HelpScreen', () => {
  it('shows the title, intro, five fields and the records note', async () => {
    await wrap(<HelpScreen id="x" inputs={roughInputs()} />);
    expect(screen.getByText('Tell us about this month')).toBeTruthy();
    expect(screen.getByText('From your records')).toBeTruthy();
    for (const l of ['Income this month', 'Spent so far this month', 'Saving this month', 'Loan payments this month', 'Investments this month'])
      expect(screen.getAllByText(l).length).toBeGreaterThan(0);
  });

  it('writes the five rough figures and rough_as_of, tracks once, and goes back', async () => {
    await wrap(<HelpScreen id="x" inputs={roughInputs()} />);
    await fireEvent.press(screen.getByText('Check with these figures'));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = mockUpdate.mock.calls[0]![0] as Record<string, unknown>;
    expect(patch).toMatchObject({
      rough_income: 300000,
      rough_spending: 100000,
      rough_saving: 0,
      rough_debt: 15000,
      rough_invest: 0,
      rough_as_of: '2026-10-20',
      currency: 'USD',
    });
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('decide_help_used', {});
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('disables the check while income and spending are both empty', async () => {
    await wrap(<HelpScreen id="x" inputs={roughInputs({ lines: [] })} />);
    expect(screen.queryByText('From your records')).toBeNull();
    await fireEvent.press(screen.getByText('Check with these figures'));
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('opens the Activity tab from Update my records instead', async () => {
    await wrap(<HelpScreen id="x" inputs={roughInputs()} />);
    await fireEvent.press(screen.getByText('Update my records instead'));
    expect(returnToTab).toHaveBeenCalledWith('/activity', undefined);
  });
});
