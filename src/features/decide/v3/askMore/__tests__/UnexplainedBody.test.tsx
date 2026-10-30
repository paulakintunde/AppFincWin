/** Plan 05.3-33: D-50 what extra money is for. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { AskQuestion } from '@/features/decide/v3/model/ask';
import { UnexplainedBody } from '../UnexplainedBody';

jest.setTimeout(60000);

const mockSave = jest.fn((_a: unknown) => ({ stepId: 'step-1' }) as { stepId: string } | null);
const mockToast = jest.fn();
jest.mock('@/data/mutations/decideSetup', () => ({ useSaveUnexplainedAnswer: () => ({ save: (a: unknown) => mockSave(a) }) }));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ today: '2026-10-30', homeCurrency: 'USD' }) }));

const question: AskQuestion = { code: 'unexplained_money_question', questionKey: 'k', variant: null, params: { amount: 25000 }, pay: null, months: [] };
const props = { question, checkId: 'c1', userId: 'u1', householdId: 'h1' };

const wrap = (ui: React.ReactElement) =>
  render(
    <FontScaleProvider>
      <ThemeProvider>{ui}</ThemeProvider>
    </FontScaleProvider>,
  );

describe('UnexplainedBody', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['It’s spare', 'spare'],
    ['An envelope or goal', 'envelope_or_goal'],
    ['Set aside for a bill', 'set_aside_for_bill'],
    ['Someone else’s money', 'someone_elses'],
  ])('%s saves use %s with the amount and today', async (label, use) => {
    const onSaved = jest.fn();
    await wrap(<UnexplainedBody {...props} onSaved={onSaved} />);
    await fireEvent.press(screen.getByLabelText(label));
    expect(mockSave).toHaveBeenCalledWith({ amount: 25000, use, at: '2026-10-30' });
    expect(mockToast).not.toHaveBeenCalled(); // the question card shows the toast (askToastKey)
    expect(onSaved).toHaveBeenCalledWith('step-1');
  });

  it('shows no toast when nothing changed', async () => {
    mockSave.mockReturnValueOnce(null);
    const onSaved = jest.fn();
    await wrap(<UnexplainedBody {...props} onSaved={onSaved} />);
    await fireEvent.press(screen.getByLabelText('It’s spare'));
    expect(mockToast).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(null);
  });
});
