/** Plan 05.3-32 (D-48): the low-month cover answer is the user's own, saved with the note shown. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { VolatileCoverBody } from '../VolatileCoverBody';
import { askToastKey } from '../AskCard';
import { coverQuestion } from './askTestKit';

jest.setTimeout(60000);

jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./askTestKit').fakeFormat }));
const mockSave = jest.fn();
const mockHaptic = jest.fn();
jest.mock('@/data/mutations/decideAnswers', () => ({ useSaveDecideAnswer: () => ({ save: (a: unknown) => mockSave(a) }) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: () => mockHaptic() }));

const wrap = (ui: React.ReactElement) => (
  <FontScaleProvider>
    <ThemeProvider>{ui}</ThemeProvider>
  </FontScaleProvider>
);
const props = () => ({ question: coverQuestion(), checkId: 'check-7', userId: 'u1', householdId: 'h1', onSaved: jest.fn() });

beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockReturnValue({ id: 'r1', stepId: 'step-3' });
});

describe('VolatileCoverBody', () => {
  it('shows the note that this is only the answer', async () => {
    await render(wrap(<VolatileCoverBody {...props()} />));
    expect(screen.getByText('This is only your answer. It is not checked against your records.')).toBeTruthy();
  });

  it('Yes saves covers: true for this check', async () => {
    const p = props();
    await render(wrap(<VolatileCoverBody {...p} />));
    await fireEvent.press(screen.getByText('Yes, I can cover it'));
    expect(mockSave).toHaveBeenCalledWith({ kind: 'volatile_cover', checkId: 'check-7', covers: true });
    expect(p.onSaved).toHaveBeenCalledWith('step-3');
    expect(mockHaptic).toHaveBeenCalledTimes(1);
    expect(askToastKey(p.question)).toBe('answerSaved');
  });

  it('No saves covers: false', async () => {
    await render(wrap(<VolatileCoverBody {...props()} />));
    await fireEvent.press(screen.getByText('No, I can’t'));
    expect(mockSave).toHaveBeenCalledWith({ kind: 'volatile_cover', checkId: 'check-7', covers: false });
  });

  it('reports a null step when the stored answer is the same', async () => {
    mockSave.mockReturnValue(null);
    const p = props();
    await render(wrap(<VolatileCoverBody {...p} />));
    await fireEvent.press(screen.getByText('Yes, I can cover it'));
    expect(p.onSaved).toHaveBeenCalledWith(null);
  });
});
