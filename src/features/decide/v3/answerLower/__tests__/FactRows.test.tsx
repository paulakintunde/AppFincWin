/** Plan 05.3-38: the facts card. Sam fits_unspent figures, negatives, the quoted_differs tone and D-11 (no "9999" anywhere). */
import React from 'react';
import { cleanup, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { allNodes } from '@/features/decide/__tests__/helpers/r18Fit';
import { wrap } from '@/features/decide/v3/answer/__tests__/kit';
import { factRows } from '@/features/decide/v3/model/factRows';
import { FactRows } from '../FactRows';

jest.setTimeout(60000);

jest.mock('@/features/decide/v3/shared/useV3Format', () => {
  const money = (n: number): string => '$' + (n / 100).toLocaleString('en-US');
  const months: Record<string, string> = { '2026-10': 'October', '2027-01': 'January' };
  return {
    useV3Format: () => ({
      money,
      moneyA11y: money,
      month: (ym: string) => months[ym] ?? ym,
      monthYear: (ym: string) => ym,
      date: (iso: string) => iso,
      params: () => ({ screen: {}, a11y: {} }),
      flat: (p: Record<string, string | number>, moneyKeys: readonly string[]) => {
        const screen: Record<string, string> = {};
        for (const [k, v] of Object.entries(p)) {
          if (k === 'envelopeId') screen.envelope = 'Holiday';
          else screen[k] = moneyKeys.includes(k) && typeof v === 'number' ? money(v) : String(v);
        }
        return { screen, a11y: screen };
      },
    }),
  };
});

afterEach(cleanup);

const result = (facts: { code: string; values: Record<string, unknown> }[]) => ({ code: 'fits_unspent', facts, readyBy: null }) as never;

function textsOf(): string[] {
  return allNodes()
    .filter((n) => n.type === 'Text')
    .map((n) => n.children.map((c) => (typeof c === 'string' ? c : '')).join(''));
}

describe('FactRows', () => {
  it('Sam fits_unspent: month, unspent with its from line, emergency fund untouched', async () => {
    const rows = factRows(
      result([
        { code: 'month_left_after', values: { month: '2026-10', left: 42500 } },
        { code: 'unspent_before_after', values: { before: 240000, after: 162500 } },
        { code: 'emergency_untouched', values: { amount: 900000 } },
      ]),
    );
    await wrap(<FactRows rows={rows} />);
    expect(screen.getByLabelText('October remaining after this, $425.')).toBeTruthy();
    expect(screen.getByText('Unspent money')).toBeTruthy();
    expect(screen.getByText('$1,625')).toBeTruthy();
    expect(screen.getByText('from $2,400')).toBeTruthy();
    expect(screen.getByLabelText('Unspent money, $1,625. from $2,400.')).toBeTruthy();
    expect(screen.getByText('Emergency fund')).toBeTruthy();
    expect(screen.getByText('$9,000')).toBeTruthy();
    expect(screen.getByText('untouched')).toBeTruthy();
  });

  it('a negative figure is danger with a minus sign', async () => {
    const rows = factRows(result([{ code: 'month_left_after', values: { month: '2026-10', left: -12500 } }]));
    await wrap(<FactRows rows={rows} />);
    const fig = screen.getByText('−$125');
    expect(StyleSheet.flatten(fig.props.style).color).toBe('#B4472A');
    expect(fig.props.numberOfLines).toBe(1);
    expect(fig.props.adjustsFontSizeToFit).toBe(true);
    expect(fig.props.minimumFontScale).toBe(0.8);
  });

  it('quoted_differs renders in warn1; rows are at least 52 high with a hairline between', async () => {
    const rows = factRows(
      result([
        { code: 'quoted_differs', values: { quoted: 20000, computed: 21000 } },
        { code: 'deferred_interest_term', values: {} },
      ]),
    );
    await wrap(<FactRows rows={rows} />);
    const warn = screen.getByText('The quoted payment of $200 differs from the $210 worked out here.');
    expect(StyleSheet.flatten(warn.props.style).color).toBe('#8A5A1B');
    const first = screen.getByLabelText('The quoted payment of $200 differs from the $210 worked out here.');
    const style = StyleSheet.flatten(first.props.style);
    expect(style.minHeight).toBe(52);
    expect(style.borderBottomWidth).toBe(1);
  });

  it('D-11: implied_rate 9999 reads over 999% and no text node holds 9999', async () => {
    const rows = factRows(result([{ code: 'implied_rate', values: { rate: '9999' } }]));
    await wrap(<FactRows rows={rows} />);
    expect(screen.getByText('The payments mean a rate of over 999% a year.')).toBeTruthy();
    for (const text of textsOf()) expect(text).not.toContain('9999');
    for (const n of allNodes()) {
      const label = n.props.accessibilityLabel;
      if (typeof label === 'string') expect(label).not.toContain('9999');
    }
  });

  it('an envelope row reads the name, never the id', async () => {
    const rows = factRows(result([{ code: 'envelope_used', values: { used: 3000, envelopeId: 'env-1' } }]));
    await wrap(<FactRows rows={rows} />);
    expect(screen.getByText('From Holiday')).toBeTruthy();
    expect(screen.queryByText(/env-1/)).toBeNull();
  });

  it('renders nothing for no rows', async () => {
    await wrap(<FactRows rows={[]} />);
    expect(textsOf()).toEqual([]);
  });
});
