import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { fontSize } from '@/theme/typography';
import { resetSessionMotion } from '@/ui/motion/useOncePerSession';
import * as health from '@/engine/health';
import { ScoreCard, type ScoreCardProps } from '../ScoreCard';

jest.mock('@/engine/health', () => ({ healthInputsOf: jest.fn(() => ({})), healthScore: jest.fn() }));
jest.setTimeout(30000);
const opts = { includeHiddenElements: true };
const mockScore = health.healthScore as jest.Mock;
const mockInputs = health.healthInputsOf as jest.Mock;

function wrap(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }}>
      <ThemeProvider>
        <FontScaleProvider value={1}>{ui}</FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

const prepared = {} as never;
const base = (over: Partial<ScoreCardProps> = {}): ScoreCardProps => ({
  scope: 'mine',
  minePrepared: prepared,
  status: 'ready',
  onSwitchToMine: jest.fn(),
  onGapAction: jest.fn(),
  onRetry: jest.fn(),
  ...over,
});
const scored = (short = false) => ({
  kind: 'score',
  score: 72,
  capped: short,
  short,
  parts: [
    { id: 'kept', points: 27, max: 35, figure: 18 },
    { id: 'cover', points: 21, max: 30, figure: 21 },
    { id: 'debt', points: 14, max: 20, figure: 20 },
    { id: 'billsToPay', points: 10, max: 15, figure: 10 },
  ],
});

beforeEach(() => {
  resetSessionMotion();
  mockScore.mockReset();
  mockInputs.mockClear();
});

describe('ScoreCard', () => {
  it('replaces itself in Household and never reads the engine', async () => {
    const onSwitch = jest.fn();
    const { getByText, queryByTestId } = await wrap(<ScoreCard {...base({ scope: 'household', onSwitchToMine: onSwitch })} />);
    expect(getByText('Your score is in Just me', opts)).toBeTruthy();
    fireEvent.press(getByText('Switch to Just me', opts));
    expect(onSwitch).toHaveBeenCalled();
    expect(queryByTestId('score-figure', opts)).toBeNull();
    expect(mockInputs).not.toHaveBeenCalled();
    expect(mockScore).not.toHaveBeenCalled();
  });

  it('shows the number, the fixed sentence, four parts in order with figures and points, and the footer', async () => {
    mockScore.mockReturnValue(scored());
    const { getByText, getByTestId, queryByTestId } = await wrap(<ScoreCard {...base()} />);
    expect(getByText('This month, as Decide sees it', opts)).toBeTruthy();
    const figure = getByTestId('score-figure', opts);
    expect(figure.props.children).toBe('72');
    expect(JSON.stringify(figure.props.style)).toContain(String(fontSize.healthScore));
    expect(getByText('out of 100', opts)).toBeTruthy();
    expect(getByText('Score 72 out of 100, from these figures', opts)).toBeTruthy();
    for (const s of [
      'Share of income kept',
      'Months of cover',
      'Debt against yearly income',
      'Bills still to pay this month',
      '18% kept',
      '2.1 months',
      '20% of a year’s income',
      '10% of money out',
      '27 of 35',
      '21 of 30',
      '14 of 20',
      '10 of 15',
      'A way to read your own figures. Not a rating.',
    ]) {
      expect(getByText(s, opts)).toBeTruthy();
    }
    expect(queryByTestId('score-short-badge', opts)).toBeNull();
    expect(queryByTestId('score-short-line', opts)).toBeNull();
    expect(mockInputs).toHaveBeenCalledWith(prepared);
  });

  it('reads one month as singular, and zero debt and zero bills in words', async () => {
    const s = scored();
    s.parts = [
      { id: 'kept', points: 35, max: 35, figure: 40 },
      { id: 'cover', points: 10, max: 30, figure: 10 },
      { id: 'debt', points: 20, max: 20, figure: 0 },
      { id: 'billsToPay', points: 15, max: 15, figure: 0 },
    ];
    mockScore.mockReturnValue(s);
    const { getByText } = await wrap(<ScoreCard {...base()} />);
    expect(getByText('1.0 month', opts)).toBeTruthy();
    expect(getByText('No debt recorded', opts)).toBeTruthy();
    expect(getByText('No bills left to pay', opts)).toBeTruthy();
  });

  it('marks a short month with the badge and the under-75 line', async () => {
    mockScore.mockReturnValue(scored(true));
    const { getByTestId, getByText } = await wrap(<ScoreCard {...base()} />);
    expect(getByTestId('score-short-badge', opts)).toBeTruthy();
    expect(getByText('Short', opts)).toBeTruthy();
    expect(getByText('Decide shows this month as short, so the score stays under 75.', opts)).toBeTruthy();
  });

  it.each([
    ['income', 'Add this month’s income and the score appears.', 'Add income'],
    ['spending', 'Add this month’s spending and the score appears.', 'Add spending'],
    ['balance', 'Add an account balance and the score appears.', 'Add an account'],
  ] as const)('shows a dash and names the %s gap with a fix button, no part rows', async (missing, line, action) => {
    mockScore.mockReturnValue({ kind: 'thin', missing });
    const onGap = jest.fn();
    const { getByTestId, getByText, queryByTestId } = await wrap(<ScoreCard {...base({ onGapAction: onGap })} />);
    expect(getByTestId('score-figure', opts).props.children).toBe('—');
    expect(getByText(line, opts)).toBeTruthy();
    fireEvent.press(getByText(action, opts));
    expect(onGap).toHaveBeenCalledWith(missing);
    expect(queryByTestId('score-part-kept', opts)).toBeNull();
  });

  it('shows a placeholder, never a number, while loading, and an error card with retry', async () => {
    const a = await wrap(<ScoreCard {...base({ minePrepared: null, status: 'loading' })} />);
    expect(a.getByTestId('score-loading', opts)).toBeTruthy();
    expect(a.queryByTestId('score-figure', opts)).toBeNull();
    const onRetry = jest.fn();
    const b = await wrap(<ScoreCard {...base({ minePrepared: null, status: 'error', onRetry })} />);
    fireEvent.press(b.getByText('Try again', opts));
    expect(onRetry).toHaveBeenCalled();
  });

  it('uses no grade words anywhere in the rendered text', async () => {
    mockScore.mockReturnValue(scored(true));
    const { toJSON } = await wrap(<ScoreCard {...base()} />);
    const text = JSON.stringify(toJSON());
    expect(text).not.toMatch(/\b(healthy|unhealthy|poor|good|bad|strong|steady|tight|great|excellent)\b/i);
  });
});
