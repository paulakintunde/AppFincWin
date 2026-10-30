/** Plan 05.3-33: D-34 income pattern. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { AskQuestion } from '@/features/decide/v3/model/ask';
import { IncomePatternBody } from '../IncomePatternBody';

jest.setTimeout(60000);

const mockSave = jest.fn((_i: unknown) => ({ stepId: 'step-2' }) as { stepId: string } | null);
const mockToast = jest.fn();
jest.mock('@/data/mutations/decideSetup', () => ({ useSaveSetupStep: () => ({ save: (i: unknown) => mockSave(i) }) }));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const question: AskQuestion = { code: 'income_pattern_unconfirmed', questionKey: 'k', variant: null, params: {}, pay: null, months: [] };
const props = { question, checkId: 'c1', userId: 'u1', householdId: 'h1' };

const wrap = (ui: React.ReactElement) =>
  render(
    <FontScaleProvider>
      <ThemeProvider>{ui}</ThemeProvider>
    </FontScaleProvider>,
  );

describe('IncomePatternBody', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['Steady', 'steady'],
    ['Changes month to month', 'variable'],
    ['Follows the seasons', 'seasonal'],
  ])('%s saves income_pattern %s as confirmed with the undo label', async (label, value) => {
    const onSaved = jest.fn();
    await wrap(<IncomePatternBody {...props} onSaved={onSaved} />);
    await fireEvent.press(screen.getByLabelText(label));
    expect(mockSave).toHaveBeenCalledWith({ labelKey: 'incomePatternSaved', patch: { income_pattern: value, income_pattern_confirmed: true } });
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'undo.label.incomePatternSaved', params: {} }, stepId: 'step-2' });
    expect(onSaved).toHaveBeenCalledWith('step-2');
  });

  it('shows no toast on a null save', async () => {
    mockSave.mockReturnValueOnce(null);
    await wrap(<IncomePatternBody {...props} onSaved={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Steady'));
    expect(mockToast).not.toHaveBeenCalled();
  });
});
