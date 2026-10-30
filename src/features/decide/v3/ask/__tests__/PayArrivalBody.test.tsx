/** Plan 05.3-32: pay arrival saves the engine's unseen pay (series, date) with the right answer. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { PayArrivalBody } from '../PayArrivalBody';
import { askToastKey } from '../AskCard';
import { payQuestion } from './askTestKit';

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
const props = (over: Partial<React.ComponentProps<typeof PayArrivalBody>> = {}) => ({
  question: payQuestion(),
  checkId: 'c1',
  userId: 'u1',
  householdId: 'h1',
  onSaved: jest.fn(),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockReturnValue({ id: 'r1', stepId: 'step-9' });
});

describe('PayArrivalBody', () => {
  it('Yes saves arrived: true for the unseen pay and reports the step', async () => {
    const p = props();
    await render(wrap(<PayArrivalBody {...p} />));
    await fireEvent.press(screen.getByText('Yes, it arrived'));
    expect(mockSave).toHaveBeenCalledWith({ kind: 'pay_arrival', seriesId: 's1', payDate: '2026-10-15', arrived: true });
    expect(p.onSaved).toHaveBeenCalledWith('step-9');
    expect(mockHaptic).toHaveBeenCalledTimes(1);
    expect(askToastKey(p.question)).toBe('payArrivalSaved');
  });

  it('No saves arrived: false', async () => {
    await render(wrap(<PayArrivalBody {...props()} />));
    await fireEvent.press(screen.getByText('No, not yet'));
    expect(mockSave).toHaveBeenCalledWith({ kind: 'pay_arrival', seriesId: 's1', payDate: '2026-10-15', arrived: false });
  });

  it('reports a null step when nothing changed', async () => {
    mockSave.mockReturnValue(null);
    const p = props();
    await render(wrap(<PayArrivalBody {...p} />));
    await fireEvent.press(screen.getByText('Yes, it arrived'));
    expect(p.onSaved).toHaveBeenCalledWith(null);
  });

  it('with no pay entry both buttons are disabled and nothing is saved', async () => {
    await render(wrap(<PayArrivalBody {...props({ question: payQuestion(null) })} />));
    const yes = screen.getByRole('button', { name: 'Yes, it arrived' });
    const no = screen.getByRole('button', { name: 'No, not yet' });
    expect(yes.props.accessibilityState.disabled).toBe(true);
    expect(no.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByText('Yes, it arrived'));
    expect(mockSave).not.toHaveBeenCalled();
  });
});
