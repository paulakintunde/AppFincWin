/** Plan 05.3-25: AnswerHero tones, catalogue text, haptics and busy. */
import React from 'react';
import { StyleSheet } from 'react-native';
import { screen } from '@testing-library/react-native';
import { colors, warnTint } from '@/theme/tokens';
import { hapticWarning } from '@/ui/haptics';
import { AnswerHero } from '../AnswerHero';
import { NINE, ev, wrap } from './kit';

jest.setTimeout(60000);

jest.mock('@/ui/haptics', () => ({ hapticWarning: jest.fn(), hapticSelection: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u', householdId: 'h', homeCurrency: 'USD', showCents: false }),
}));
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ all: [] }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/decide', () => ({ usePots: () => ({ data: { live: [], done: [] } }) }));

const FILL: Record<string, string> = {
  fits_month: colors.accentTint1,
  'fits_month.low_month': warnTint,
  fits_unspent: colors.fill1,
  'fits_unspent.low_month': warnTint,
  'not_yet.payday': warnTint,
  'not_yet.not_covered': colors.dangerTint1,
  monthly_short: colors.dangerTint1,
  emergency_use: warnTint,
  needs_input: colors.fill2,
};

function rootFill(): unknown {
  const stack = [screen.container as unknown as { props: { style?: unknown }; children: unknown[] }];
  while (stack.length > 0) {
    const n = stack.shift()!;
    const bg = (StyleSheet.flatten(n.props?.style as never) as { backgroundColor?: string } | undefined)?.backgroundColor;
    if (bg !== undefined) return bg;
    for (const c of n.children) if (typeof c !== 'string') stack.push(c as never);
  }
  return undefined;
}

describe('AnswerHero', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(NINE)('$name: tone fill, chip and catalogue text with no raw placeholder', async (row) => {
    await wrap(<AnswerHero evaluation={row.ev} />);
    expect(rootFill()).toBe(FILL[row.name]);
    const group = screen.getByLabelText(/\./);
    const label = String(group.props.accessibilityLabel);
    expect(label).not.toMatch(/\{\{|undefined|NaN/);
    expect(label.split('. ').length).toBeGreaterThanOrEqual(2);
    expect(group.props.accessibilityLiveRegion).toBe('polite');
  });

  it('fits_month reads the real catalogue title with Sam values', async () => {
    await wrap(<AnswerHero evaluation={NINE[0]!.ev} />);
    expect(screen.getByText('Fits this month', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('This fits in October’s money.')).toBeTruthy();
    expect(screen.getByText(/October is on track to leave about \$425/)).toBeTruthy();
  });

  it('uses the tone colour for the chip words', async () => {
    await wrap(<AnswerHero evaluation={NINE[5]!.ev} />);
    const chip = screen.getByText('Not yet', { includeHiddenElements: true });
    expect(StyleSheet.flatten(chip.props.style).color).toBe(colors.danger);
  });

  it('warns once when a not_yet answer first appears, and again only on a code change', async () => {
    const notYet = NINE[5]!.ev;
    const { rerender } = await wrap(<AnswerHero evaluation={notYet} />);
    expect(hapticWarning).toHaveBeenCalledTimes(1);
    await rerender(<AnswerHero evaluation={ev({ code: 'not_yet', readyBy: { kind: 'month', month: '2027-01' } })} />);
    expect(hapticWarning).toHaveBeenCalledTimes(1);
    await rerender(<AnswerHero evaluation={NINE[6]!.ev} />);
    expect(hapticWarning).toHaveBeenCalledTimes(2);
  });

  it('never warns for fits or needs_input', async () => {
    const { rerender } = await wrap(<AnswerHero evaluation={NINE[0]!.ev} />);
    await rerender(<AnswerHero evaluation={NINE[8]!.ev} />);
    expect(hapticWarning).not.toHaveBeenCalled();
  });

  it('busy keeps the previous text and marks the group busy', async () => {
    const { rerender } = await wrap(<AnswerHero evaluation={NINE[0]!.ev} />);
    await rerender(<AnswerHero evaluation={NINE[6]!.ev} busy />);
    expect(screen.getByText('This fits in October’s money.')).toBeTruthy();
    expect(screen.getByLabelText(/This fits in October/).props.accessibilityState.busy).toBe(true);
    await rerender(<AnswerHero evaluation={NINE[6]!.ev} />);
    expect(screen.queryByText('This fits in October’s money.')).toBeNull();
  });
});
