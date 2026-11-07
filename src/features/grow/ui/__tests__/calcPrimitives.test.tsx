import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { colors } from '@/theme/tokens';
import { CalcResultCard } from '../CalcResultCard';
import { HowWorkedOutBox } from '../HowWorkedOutBox';
import { LinkedPairFields } from '../LinkedPairFields';
import { ChangeRows, changeRowLabel } from '../ChangeRows';

jest.setTimeout(30000);

const opts = { includeHiddenElements: true };
const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

async function wrap(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }}>
      <ThemeProvider>
        <FontScaleProvider value={1}>{ui}</FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('CalcResultCard', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('says Fill in the numbers above when there is no result', async () => {
    const { getByTestId, getByText } = await wrap(<CalcResultCard value={null} caption="Monthly payment" />);
    expect(getByText('Fill in the numbers above', opts)).toBeTruthy();
    expect(getByTestId('calc-result-card', opts).props.accessibilityLiveRegion).toBe('polite');
    expect(getByTestId('calc-result-card', opts).props.accessibilityLabel).toBe('Fill in the numbers above');
  });

  it('is a polite live region whose label only changes once the value settles', async () => {
    const { getByTestId, rerender } = await wrap(<CalcResultCard value="$100.00" caption="Monthly payment" />);
    const card = () => getByTestId('calc-result-card', opts);
    expect(card().props.accessibilityLiveRegion).toBe('polite');
    expect(card().props.accessibilityLabel).toBe('Monthly payment, $100.00');
    await rerender(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }}>
        <ThemeProvider>
          <FontScaleProvider value={1}>
            <CalcResultCard value="$120.00" caption="Monthly payment" />
          </FontScaleProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(card().props.accessibilityLabel).toBe('Monthly payment, $100.00');
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(card().props.accessibilityLabel).toBe('Monthly payment, $120.00');
  });
});

describe('HowWorkedOutBox', () => {
  it('is always visible with the title, the view glyph and the lines in order', async () => {
    const { getByText, getByTestId, getAllByText } = await wrap(<HowWorkedOutBox lines={['Line one', 'Line two']} />);
    expect(getByText('How it was worked out', opts)).toBeTruthy();
    expect(getByTestId('grow-glyph-view', opts)).toBeTruthy();
    expect(getAllByText(/Line/, opts).map((n) => n.props.children)).toEqual(['Line one', 'Line two']);
  });
});

describe('LinkedPairFields', () => {
  const field = (label: string, value: string, onChangeText = jest.fn()) => ({ label, value, onChangeText });

  it('highlights the last edited field and shows the other as plain', async () => {
    const { getByTestId } = await wrap(
      <LinkedPairFields first={field('Each month', '100')} second={field('By', 'Oct 2028')} lastEdited="first" />,
    );
    expect(flat(getByTestId('pair-first-box', opts)).borderColor).toBeTruthy();
    expect(flat(getByTestId('pair-first-box', opts)).backgroundColor).toBe(colors.accentTint1);
    expect(flat(getByTestId('pair-second-box', opts)).backgroundColor).toBe(colors.surface);
  });

  it('has fields at least 44 tall and forwards edits', async () => {
    const onChange = jest.fn();
    const { getByTestId } = await wrap(
      <LinkedPairFields first={field('Each month', '100', onChange)} second={field('By', 'Oct 2028')} lastEdited="second" />,
    );
    expect(flat(getByTestId('pair-first-box', opts)).minHeight).toBe(44);
    fireEvent.changeText(getByTestId('pair-first-input', opts), '120');
    expect(onChange).toHaveBeenCalledWith('120');
  });

  it('stacks vertically above 1.3x font scale', async () => {
    const dims = jest.requireActual('react-native').Dimensions;
    const spy = jest.spyOn(dims, 'get').mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1.6 });
    const { getByTestId } = await wrap(
      <LinkedPairFields first={field('Each month', '100')} second={field('By', 'Oct 2028')} lastEdited="first" />,
    );
    expect(flat(getByTestId('linked-pair', opts)).flexDirection).toBe('column');
    spy.mockRestore();
  });
});

describe('ChangeRows', () => {
  const rows = [
    { key: 'month', label: 'Each month', before: '$50.00', after: '$82.86', beforeSpoken: '50 dollars', afterSpoken: '82 dollars 86 cents' },
  ];

  it('reads each row as one sentence and hides the arrow', async () => {
    const { getByTestId } = await wrap(<ChangeRows rows={rows} />);
    const row = getByTestId('change-row-month', opts);
    expect(row.props.accessibilityLabel).toBe('Each month, from 50 dollars to 82 dollars 86 cents');
    expect(changeRowLabel(rows[0]!)).toBe('Each month, from 50 dollars to 82 dollars 86 cents');
    expect(row.props.accessible).toBe(true);
  });
});
