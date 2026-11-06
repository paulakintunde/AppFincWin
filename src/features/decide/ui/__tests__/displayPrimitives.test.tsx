import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { colors as base } from '@/theme/tokens';
import { FigureStrip } from '../FigureStrip';
import { CollapsibleSection } from '../CollapsibleSection';

jest.setTimeout(30000);
const BODY = 'Body';

let mockReduced = false;
jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useReduceMotion: () => mockReduced,
}));

const style = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

function wrap(ui: React.ReactElement, scale = 1) {
  return render(
    <ThemeProvider>
      <FontScaleProvider value={scale}>{ui}</FontScaleProvider>
    </ThemeProvider>,
  );
}

describe('FigureStrip', () => {
  const items = [
    { caption: 'Left', value: '£100', tone: 'positive' as const },
    { caption: 'Out', value: '£40', tone: 'negative' as const },
    { caption: 'In', value: '£140' },
  ];

  it('renders captions and values with the capped figure scale', async () => {
    const { getByText } = await wrap(<FigureStrip items={items} />);
    expect(getByText('Left')).toBeTruthy();
    expect(getByText('£100').props.maxFontSizeMultiplier).toBe(1.3);
    expect(style(getByText('£40')).color).toBe(base.danger);
  });

  it('D-94 a money figure reads its currency name', async () => {
    const { getByText, getByLabelText } = await wrap(
      <FigureStrip items={[{ caption: 'Left', value: 'CA$100', a11yValue: '100 Canadian dollars' }]} />
    );
    expect(getByText('CA$100').props.accessibilityLabel).toBe('100 Canadian dollars');
    expect(getByLabelText('Left, 100 Canadian dollars')).toBeTruthy();
  });

  it('IN-D02: repeated captions each render, with no key collision', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const twice = [
      { caption: 'Out', value: '£40' },
      { caption: 'Out', value: '£50' },
    ];
    const { getByText } = await wrap(<FigureStrip items={twice} />);
    expect(getByText('£40')).toBeTruthy();
    expect(getByText('£50')).toBeTruthy();
    expect(error.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false);
    error.mockRestore();
  });

  it('lays out as a row at normal scale and stacks above 1.3x', async () => {
    const normal = await wrap(<FigureStrip items={items} />);
    expect(style(normal.getByLabelText('Left, £100').parent as never).flexDirection).toBe('row');
    const big = await wrap(<FigureStrip items={items} />, 1.5);
    expect(style(big.getAllByLabelText('Left, £100')[0]!.parent as never).flexDirection).toBeUndefined();
    expect(style(big.getAllByLabelText('Left, £100')[0]! as never).flexDirection).toBe('row');
  });
});
describe('CollapsibleSection', () => {
  beforeEach(() => {
    mockReduced = false;
  });

  it('exposes expanded state and hides children while closed', async () => {
    const onToggle = jest.fn();
    const { getByRole, queryByText, rerender } = await wrap(
      <CollapsibleSection title="Details" summary="3 lines" expanded={false} onToggle={onToggle}>
        <></>
      </CollapsibleSection>,
    );
    const header = getByRole('button');
    expect(header.props.accessibilityState).toEqual({ expanded: false });
    expect(style(header).minHeight).toBe(56);
    await fireEvent.press(header);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(queryByText('Body')).toBeNull();
    await rerender(
      <ThemeProvider>
        <FontScaleProvider value={1}>
          <CollapsibleSection title="Details" expanded onToggle={onToggle}>
            <Text>{BODY}</Text>
          </CollapsibleSection>
        </FontScaleProvider>
      </ThemeProvider>,
    );
    expect(queryByText('Body')).toBeTruthy();
  });

  it('shows content without animation under reduced motion', async () => {
    mockReduced = true;
    const { findByText } = await wrap(
      <CollapsibleSection title="Details" expanded onToggle={jest.fn()}>
        <Text>{BODY}</Text>
      </CollapsibleSection>,
    );
    expect(await findByText('Body')).toBeTruthy();
  });
});
