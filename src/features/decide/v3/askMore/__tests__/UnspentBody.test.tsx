/** Plan 05.3-33: unspent money answered in place. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { AskQuestion } from '@/features/decide/v3/model/ask';
import { UnspentBody } from '../UnspentBody';

jest.setTimeout(60000);

const mockConfirm = jest.fn((_d: number) => ({ stepId: 'step-4' }) as { stepId: string } | null);
const mockToast = jest.fn();
jest.mock('@/features/decide/setup/useUnspent', () => ({
  useUnspent: () => ({ sum: { total: 84000 }, lines: null, currency: 'USD', confirm: (d: number) => mockConfirm(d) }),
}));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: true }) }));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const question: AskQuestion = { code: 'unspent_not_confirmed', questionKey: 'k', variant: null, params: {}, pay: null, months: [] };
const props = { question, checkId: 'c1', userId: 'u1', householdId: 'h1' };

const wrap = (ui: React.ReactElement) =>
  render(
    <FontScaleProvider>
      <ThemeProvider>{ui}</ThemeProvider>
    </FontScaleProvider>,
  );

describe('UnspentBody', () => {
  beforeEach(() => jest.clearAllMocks());

  it('"That’s right" confirms the worked total with the unspentConfirmed toast', async () => {
    const onSaved = jest.fn();
    await wrap(<UnspentBody {...props} onSaved={onSaved} />);
    await fireEvent.press(screen.getByLabelText('That’s right'));
    expect(mockConfirm).toHaveBeenCalledWith(84000);
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'undo.label.unspentConfirmed', params: {} }, stepId: 'step-4' });
    expect(onSaved).toHaveBeenCalledWith('step-4');
  });

  it('"Use my own figure" reveals the field and "Save figure" saves the typed figure', async () => {
    const onSaved = jest.fn();
    await wrap(<UnspentBody {...props} onSaved={onSaved} />);
    await fireEvent.press(screen.getByLabelText('Use my own figure'));
    expect(screen.queryByLabelText('That’s right')).toBeNull();
    expect(screen.getByLabelText('Save figure').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Your unspent money'), '500');
    await fireEvent.press(screen.getByLabelText('Save figure'));
    expect(mockConfirm).toHaveBeenCalledWith(50000);
    expect(onSaved).toHaveBeenCalledWith('step-4');
  });

  it('shows no toast when confirm writes nothing', async () => {
    mockConfirm.mockReturnValueOnce(null);
    await wrap(<UnspentBody {...props} onSaved={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('That’s right'));
    expect(mockToast).not.toHaveBeenCalled();
  });
});
