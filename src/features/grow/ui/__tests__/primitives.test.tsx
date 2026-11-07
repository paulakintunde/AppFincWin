import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { GROW_GLYPH_NAMES, GrowGlyph } from '../GrowGlyph';
import { ProgressBar, clampPercent } from '../ProgressBar';
import { Stepper } from '../Stepper';
import { StateBadge } from '../StateBadge';

jest.setTimeout(30000);

let mockReduced = false;
jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useReduceMotion: () => mockReduced,
}));

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

describe('GrowGlyph', () => {
  it('renders every listed name, hidden from the accessibility tree', async () => {
    const { getByTestId } = await wrap(
      <>
        {GROW_GLYPH_NAMES.map((name) => (
          <GrowGlyph key={name} name={name} color="#000000" />
        ))}
      </>,
    );
    expect(GROW_GLYPH_NAMES).toHaveLength(27);
    for (const name of GROW_GLYPH_NAMES) {
      const glyph = getByTestId(`grow-glyph-${name}`, opts);
      expect(glyph.props.accessibilityElementsHidden).toBe(true);
      expect(glyph.props.importantForAccessibility).toBe('no-hide-descendants');
    }
  });
});

describe('ProgressBar', () => {
  beforeEach(() => {
    mockReduced = false;
  });

  it('is a progressbar with min, max and now', async () => {
    const { getByRole } = await wrap(<ProgressBar percent={36} accessibilityLabel="Trip to Lisbon" />);
    const bar = getByRole('progressbar', opts);
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 36 });
    expect(bar.props.accessibilityLabel).toBe('Trip to Lisbon');
  });

  it('clamps out-of-range and non-finite values', () => {
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(-4)).toBe(0);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(36.4)).toBe(36);
  });

  it('draws the fill at its final width at once with Reduce Motion on', async () => {
    mockReduced = true;
    const { getByTestId } = await wrap(<ProgressBar percent={57} />);
    expect(flat(getByTestId('grow-progress-fill', opts)).width).toBe('57%');
  });

  it('has thin (4) and thick (8) variants', async () => {
    mockReduced = true;
    const thin = await wrap(<ProgressBar percent={10} variant="thin" />);
    expect(flat(thin.getByTestId('grow-progress', opts)).height).toBe(4);
    await thin.unmount();
    const thick = await wrap(<ProgressBar percent={10} variant="thick" />);
    expect(flat(thick.getByTestId('grow-progress', opts)).height).toBe(8);
  });

  it('draws a tick when asked', async () => {
    mockReduced = true;
    const { getByTestId } = await wrap(<ProgressBar percent={10} tickPercent={36} />);
    expect(flat(getByTestId('grow-progress-tick', opts)).left).toBe('36%');
  });
});

describe('Stepper', () => {
  async function setup(value: number, onChange = jest.fn(), min = 0) {
    const utils = await wrap(
      <Stepper
        value={value}
        step={25}
        min={min}
        onChange={onChange}
        valueText={`$${value}`}
        accessibilityLabel={`Extra each month, ${value} dollars`}
        decrementLabel="Less"
        incrementLabel="More"
      />,
    );
    return { ...utils, onChange };
  }

  it('has 44 x 44 minus and plus buttons', async () => {
    const { getByTestId } = await setup(50);
    for (const id of ['grow-stepper-minus', 'grow-stepper-plus']) {
      const style = flat(getByTestId(id, opts));
      expect(style.width).toBe(44);
      expect(style.height).toBe(44);
    }
  });

  it('is adjustable with increment and decrement actions', async () => {
    const { getByTestId, onChange } = await setup(50);
    const group = getByTestId('grow-stepper', opts);
    expect(group.props.accessibilityRole).toBe('adjustable');
    expect(group.props.accessibilityLabel).toBe('Extra each month, 50 dollars');
    expect(group.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['increment', 'decrement']);
    group.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(75);
    group.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(25);
  });

  it('steps with the buttons and never goes below min', async () => {
    const first = await setup(25);
    const { getByTestId, onChange } = first;
    await fireEvent.press(getByTestId('grow-stepper-plus', opts));
    expect(onChange).toHaveBeenLastCalledWith(50);
    await fireEvent.press(getByTestId('grow-stepper-minus', opts));
    expect(onChange).toHaveBeenLastCalledWith(0);
    onChange.mockClear();
    await first.unmount();
    const atMin = await setup(0, onChange);
    await fireEvent.press(atMin.getByTestId('grow-stepper-minus', opts));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores a decrement action below min', async () => {
    const { getByTestId, onChange } = await setup(0);
    getByTestId('grow-stepper', opts).props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('StateBadge', () => {
  it('renders a shape and a word for every tone', async () => {
    const { getByText, getAllByTestId } = await wrap(
      <>
        <StateBadge tone="accent" shape="sCheck" label="Met" />
        <StateBadge tone="warn" shape="sOver" label="Over your rule" />
        <StateBadge tone="blue" shape="lock" label="Locked" accessibilityLabel="Locked, no Decide answer spends it" />
        <StateBadge tone="plum" shape="sHalf" label="Linked to a check" />
        <StateBadge tone="slate" shape="sClock" label="Expected" />
      </>,
    );
    for (const word of ['Met', 'Over your rule', 'Locked', 'Linked to a check', 'Expected']) expect(getByText(word)).toBeTruthy();
    const badges = getAllByTestId('grow-state-badge', opts);
    expect(badges).toHaveLength(5);
    expect(badges[2]!.props.accessibilityLabel).toBe('Locked, no Decide answer spends it');
    expect(badges[0]!.props.accessibilityLabel).toBe('Met');
  });
});
