// 05.4-39 (D-156): warnTint, StateChip and WarningCard tests, split from decide's displayPrimitives.test.tsx when the parts moved to src/ui.
import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { categorySwatch, colors as base, warnTint } from '@/theme/tokens';
import { StateChip } from '../StateChip';
import { WarningCard } from '../WarningCard';

jest.setTimeout(30000);

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
