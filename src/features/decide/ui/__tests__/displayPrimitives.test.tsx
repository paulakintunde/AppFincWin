import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { categorySwatch, colors as base, warnTint } from '@/theme/tokens';
import { StateChip } from '../StateChip';
import { FigureStrip } from '../FigureStrip';
import { WarningCard } from '../WarningCard';
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

describe('warnTint (IN-D01)', () => {
  it('is the named §2 ochre tint every warning surface shares', () => {
    expect(warnTint).toBe(categorySwatch.ochre.tint);
  });
});

describe('StateChip', () => {
  it('renders the label and an accent tint for fits', async () => {
    const { getByText, getByTestId } = await wrap(<StateChip tone="fits" label="Fits" />);
    expect(getByText('Fits')).toBeTruthy();
    expect(getByTestId('accent-tint')).toBeTruthy();
  });

  it('uses the ochre pair for adjust and waiting', async () => {
    for (const tone of ['adjust', 'waiting'] as const) {
      const { getByText } = await wrap(<StateChip tone={tone} label={tone} />);
      expect(style(getByText(tone)).color).toBe(base.warn1);
      expect(style(getByText(tone).parent as never).backgroundColor).toBe(warnTint);
    }
  });

  it('uses the danger pair for no', async () => {
    const { getByText } = await wrap(<StateChip tone="no" label="Does not fit" />);
    expect(style(getByText('Does not fit')).color).toBe(base.danger);
  });

  it('uses fill1 and inkDim for the quiet tones', async () => {
    for (const tone of ['missing', 'draft', 'passed'] as const) {
      const { getByText, queryByTestId } = await wrap(<StateChip tone={tone} label={tone} />);
      expect(style(getByText(tone)).color).toBe(base.inkDim);
      expect(queryByTestId('accent-tint')).toBeNull();
    }
  });
});

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

  it('lays out as a row at normal scale and stacks above 1.3x', async () => {
    const normal = await wrap(<FigureStrip items={items} />);
    expect(style(normal.getByLabelText('Left, £100').parent as never).flexDirection).toBe('row');
    const big = await wrap(<FigureStrip items={items} />, 1.5);
    expect(style(big.getAllByLabelText('Left, £100')[0]!.parent as never).flexDirection).toBeUndefined();
    expect(style(big.getAllByLabelText('Left, £100')[0]! as never).flexDirection).toBe('row');
  });
});

describe('WarningCard', () => {
  it('is one labelled element with the title, value and body', async () => {
    const { getByLabelText } = await wrap(
      <WarningCard tone="hard" title="This month" value="-£50" body={['Line one.', 'Line two.']} />,
    );
    const card = getByLabelText('This month, -£50. Line one. Line two.');
    const s = style(card);
    expect(s.backgroundColor).toBe(base.dangerTint3);
    expect(s.borderColor).toBe(base.dangerTint2);
    expect(s.borderWidth).toBe(1.5);
    expect(s.borderRadius).toBe(26);
    expect(s.padding).toBe(16);
  });

  it('uses ochre tint, line2 and warn1 for soft', async () => {
    const { getByLabelText, getByText } = await wrap(<WarningCard tone="soft" title="Cash" value="£20" body={['Tight.']} />);
    const s = style(getByLabelText('Cash, £20. Tight.'));
    expect(s.backgroundColor).toBe(warnTint);
    expect(s.borderColor).toBe(base.line2);
    expect(style(getByText('Cash')).color).toBe(base.warn1);
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
