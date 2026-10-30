/** Plan 05.3-32 (D-07, D-08): the in-place question card shell. */
import React from 'react';
import { AccessibilityInfo, Text as RNText } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { AskCard, askToastKey } from '../AskCard';
import { accountUseQuestion, coverQuestion, fakeFormat, modelOf, payQuestion } from './askTestKit';

jest.setTimeout(60000);

const mockToast = jest.fn();
const mockTrack = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./askTestKit').fakeFormat }));
// the test renderer has no native node handle, so the focus helper is observed instead
const mockFocus = jest.fn();
jest.mock('../focusNode', () => ({ focusNode: (n: unknown) => mockFocus(n) }));
jest.mock('react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo', () => ({
  __esModule: true,
  default: {
    setAccessibilityFocus: jest.fn(),
    announceForAccessibility: jest.fn(),
    isScreenReaderEnabled: jest.fn(() => Promise.resolve(false)),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

const wrap = (ui: React.ReactElement) => (
  <FontScaleProvider>
    <ThemeProvider>{ui}</ThemeProvider>
  </FontScaleProvider>
);

const body = (onSaved: (id: string | null) => void) => <RNText accessibilityLabel="save-it" onPress={() => onSaved('step-1')} />;

beforeEach(() => jest.clearAllMocks());

describe('AskCard', () => {
  it('shows the eyebrow, the question with the account name and the body', async () => {
    await render(wrap(<AskCard model={modelOf(accountUseQuestion(), 1, 1, 2)} renderBody={(_q, s) => body(s)} onDone={jest.fn()} />));
    expect(screen.getByText('One thing first')).toBeTruthy();
    expect(screen.getByText(/^What is Everyday Checking for:/)).toBeTruthy();
    expect(screen.getByLabelText('save-it')).toBeTruthy();
  });

  it.each([
    [0, null],
    [1, 'and 1 more question'],
    [3, 'and 3 more questions'],
  ])('shows the "and N more" line for %i queued', async (more, line) => {
    await render(wrap(<AskCard model={modelOf(payQuestion(), more)} renderBody={() => null} onDone={jest.fn()} />));
    if (line === null) expect(screen.queryByText(/more question/)).toBeNull();
    else expect(screen.getByText(line)).toBeTruthy();
  });

  it('labels the group "Question k of n. {question}"', async () => {
    await render(wrap(<AskCard model={modelOf(accountUseQuestion(), 1, 1, 2)} renderBody={() => null} onDone={jest.fn()} />));
    expect(screen.getByLabelText(/^Question 1 of 2\. What is Everyday Checking for:/)).toBeTruthy();
  });

  it('formats the pay question with money and the date', async () => {
    await render(wrap(<AskCard model={modelOf(payQuestion())} renderBody={() => null} onDone={jest.fn()} />));
    expect(screen.getByText('Did your pay of $2500, due on on 2026-10-15, arrive?')).toBeTruthy();
  });

  it('moves focus to the question on mount', async () => {
    await render(wrap(<AskCard model={modelOf(coverQuestion())} renderBody={() => null} onDone={jest.fn()} />));
    expect(mockFocus).toHaveBeenCalledTimes(1);
    expect(mockFocus.mock.calls[0]![0]).not.toBeNull();
  });

  it('on the last question: toast with Undo, one analytics event, then onDone', async () => {
    const onDone = jest.fn();
    await render(wrap(<AskCard model={modelOf(payQuestion())} renderBody={(_q, s) => body(s)} onDone={onDone} />));
    await fireEvent.press(screen.getByLabelText('save-it'));
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'undo.label.payArrivalSaved', params: {} }, stepId: 'step-1' });
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('decide_question_answered', { missing: 'pay_arrival_question' });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('with more queued: does not finish, then announces "Saved. {next question}" when the next one arrives', async () => {
    const onDone = jest.fn();
    const r = await render(wrap(<AskCard model={modelOf(payQuestion(), 1, 1, 2)} renderBody={(_q, s) => body(s)} onDone={onDone} />));
    await fireEvent.press(screen.getByLabelText('save-it'));
    expect(onDone).not.toHaveBeenCalled();
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
    await r.rerender(wrap(<AskCard model={modelOf(coverQuestion())} renderBody={(_q, s) => body(s)} onDone={onDone} />));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Saved. Can you cover $1200 a month for 3 months, even in your low months?');
  });

  it('shows no toast when nothing changed (null step id) but still counts the answer', async () => {
    await render(
      wrap(<AskCard model={modelOf(coverQuestion())} renderBody={(_q, s) => <RNText accessibilityLabel="nothing" onPress={() => s(null)} />} onDone={jest.fn()} />)
    );
    await fireEvent.press(screen.getByLabelText('nothing'));
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });
});

describe('askToastKey', () => {
  it('picks the undo label per question', () => {
    expect(askToastKey(accountUseQuestion())).toBe('accountUseSaved');
    expect(askToastKey(accountUseQuestion({ variant: 'fund' }))).toBe('emergencySaved');
    expect(askToastKey(payQuestion())).toBe('payArrivalSaved');
    expect(askToastKey(coverQuestion())).toBe('answerSaved');
  });
});

void fakeFormat;
