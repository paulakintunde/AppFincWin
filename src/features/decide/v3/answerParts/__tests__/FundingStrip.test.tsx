/** Plan 05.3-26: the funding strip reads one sentence, hides the bar, and draws the uncovered part dashed. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { minorUnits } from '@/engine/money';
import type { FundingStrip as Model } from '@/features/decide/v3/model/funding';
import { FundingStrip } from '../FundingStrip';

jest.setTimeout(60000);

const MONTHS: Record<string, string> = { '2026-10': 'October' };
jest.mock('@/features/decide/v3/shared/useV3Format', () => {
  const money = (n: number): string => '$' + (n / 100).toLocaleString('en-US');
  return {
    useV3Format: () => ({
      money,
      moneyA11y: money,
      month: (ym: string) => MONTHS[ym] ?? ym,
      monthYear: (ym: string) => ym,
      date: (iso: string) => iso,
      params: () => ({ screen: {}, a11y: {} }),
      flat: (p: Record<string, string | number>) => {
        const screen: Record<string, string> = {};
        for (const [k, v] of Object.entries(p)) screen[k === 'envelopeId' ? 'envelope' : k] = k === 'envelopeId' ? 'Holiday' : String(v);
        return { screen, a11y: screen };
      },
    }),
  };
});

const wrap = (ui: React.ReactElement) =>
  render(
    <FontScaleProvider>
      <ThemeProvider>{ui}</ThemeProvider>
    </FontScaleProvider>,
  );

const A = 'decide.v3.ui.answer.';
const sam: Model = {
  headingKey: `${A}whereFrom`,
  headingParams: { price: minorUnits(120000) },
  parts: [
    { amount: minorUnits(42500), labelKey: `${A}fromMonth`, params: { month: '2026-10' }, style: 'accent' },
    { amount: minorUnits(77500), labelKey: `${A}fromEarlier`, style: 'accentHalf' },
  ],
  uncovered: minorUnits(0),
};

describe('FundingStrip', () => {
  it('reads the Sam fits_unspent sentence exactly and hides the bar from assistive tech', async () => {
    await wrap(<FundingStrip model={sam} />);
    expect(screen.getByLabelText('Where the $1,200 comes from: $425 from October, $775 from earlier months.')).toBeTruthy();
    const bar = screen.getByTestId('strip-bar', { includeHiddenElements: true });
    expect(bar.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(bar.props.accessibilityElementsHidden).toBe(true);
  });

  it('draws accentHalf at half opacity and no new colour', async () => {
    await wrap(<FundingStrip model={sam} />);
    const half = StyleSheet.flatten(screen.getByTestId('strip-segment-accentHalf', { includeHiddenElements: true }).props.style);
    expect(half.opacity).toBe(0.5);
  });

  it('not covered reads in the sentence and draws a dashed segment and dot', async () => {
    const notYet: Model = {
      headingKey: `${A}whereWould`,
      headingParams: { price: minorUnits(200000) },
      parts: [
        { amount: minorUnits(40000), labelKey: `${A}fromMonth`, params: { month: '2026-10' }, style: 'accent' },
        { amount: minorUnits(160000), labelKey: `${A}notCovered`, style: 'dashed' },
      ],
      uncovered: minorUnits(160000),
    };
    await wrap(<FundingStrip model={notYet} />);
    expect(screen.getByLabelText(/\$1,600 not covered yet/)).toBeTruthy();
    for (const id of ['strip-segment-dashed', 'strip-dot-dashed']) {
      const s = StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style);
      expect(s.borderStyle).toBe('dashed');
      expect(s.borderWidth).toBe(1.5);
    }
  });

  it('shows the envelope by name, never its id', async () => {
    const env: Model = {
      headingKey: `${A}whereFrom`,
      headingParams: { price: minorUnits(30000) },
      parts: [{ amount: minorUnits(30000), labelKey: `${A}fromEnvelope`, params: { envelopeId: 'env-uuid-1' }, style: 'ink' }],
      uncovered: minorUnits(0),
    };
    await wrap(<FundingStrip model={env} />);
    expect(screen.getByLabelText(/from Holiday/)).toBeTruthy();
    expect(screen.queryByText(/env-uuid-1/)).toBeNull();
  });

  it('renders nothing for a null model (needs input)', async () => {
    await wrap(<FundingStrip model={null} />);
    expect(screen.queryByTestId('strip-bar')).toBeNull();
  });
});
