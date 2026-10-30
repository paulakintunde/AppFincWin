/** Plan 05.3-33: D-35 expected income. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { AskQuestion } from '@/features/decide/v3/model/ask';
import { ExpectedIncomeBody } from '../ExpectedIncomeBody';

jest.setTimeout(60000);

const mockSave = jest.fn((_a: unknown) => ({ id: 'a1', stepId: 'step-3' }) as { id: string; stepId: string } | null);
const mockToast = jest.fn();
jest.mock('@/data/mutations/decideAnswers', () => ({ useSaveDecideAnswer: () => ({ save: (a: unknown) => mockSave(a) }) }));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ today: '2026-10-30', homeCurrency: 'USD' }) }));
jest.mock('@/features/decide/v3/shared/useV3Format', () => ({ useV3Format: () => ({ month: () => 'November' }) }));

const question = (months: string[]): AskQuestion =>
  ({ code: 'expected_income_needed', questionKey: 'k', variant: null, params: {}, pay: null, months }) as unknown as AskQuestion;
const base = { checkId: 'c1', userId: 'u1', householdId: 'h1' };

const wrap = (ui: React.ReactElement) =>
  render(
    <FontScaleProvider>
      <ThemeProvider>{ui}</ThemeProvider>
    </FontScaleProvider>,
  );

describe('ExpectedIncomeBody', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the month caption and keeps Save disabled until a value is typed', async () => {
    await wrap(<ExpectedIncomeBody {...base} question={question(['2026-11'])} onSaved={jest.fn()} />);
    expect(screen.getAllByText('Expected money in for November').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Save expected income').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Save expected income'));
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('saves the typed figure for the month and reports the step', async () => {
    const onSaved = jest.fn();
    await wrap(<ExpectedIncomeBody {...base} question={question(['2026-11'])} onSaved={onSaved} />);
    await fireEvent.changeText(screen.getByLabelText('Expected money in for November'), '1200');
    await fireEvent.press(screen.getByLabelText('Save expected income'));
    expect(mockSave).toHaveBeenCalledWith({ kind: 'expected_income', month: '2026-11', amount: 120000, at: '2026-10-30' });
    expect(mockToast).not.toHaveBeenCalled(); // the question card shows the toast (askToastKey)
    expect(onSaved).toHaveBeenCalledWith('step-3');
  });

  it('counts the months still needed', async () => {
    await wrap(<ExpectedIncomeBody {...base} question={question(['2026-11', '2026-12', '2027-01'])} onSaved={jest.fn()} />);
    expect(screen.getByText('and 2 more months')).toBeTruthy();
  });
});
