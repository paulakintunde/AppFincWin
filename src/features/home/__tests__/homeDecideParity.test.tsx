// 05.5-14 (D-19, D-04, T-05.5-14-01): Home's small "left after the month's plans" line and Decide's Your month lead are the same
// figure, in the same words, from one month picture. The words are read through i18n, never typed here, so renaming either key fails.
import React from 'react';
import { render, screen, within } from '@testing-library/react-native';
import type { MonthBar, MonthPicture } from '@/engine/month';
import { monthPicture } from '@/engine/month';
import { minorUnits } from '@/engine/money';
import { prepare } from '@/engine/decide/v3/prepare';
import { inputsOf, monthOf, v3Line } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { i18n } from '@/i18n';
import { wrap } from '@/test/stepProps';
import { YourMonthCard } from '@/features/decide/screens/home/YourMonthCard';
import { ThisMonthCard } from '../ThisMonthCard';

jest.mock('@/ui/haptics', () => ({ hapticTick: jest.fn(), hapticTap: jest.fn() }));
jest.setTimeout(30000);

const fmtMinor = (n: number): string => `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatter = {
  locale: 'en-US',
  formatMoney: (m: { amount: number }) => fmtMinor(m.amount),
  formatDate: (d: string) => d,
} as unknown as MoneyFormatter;

const norm = (s: string): string => s.replace(/[’‘]/g, "'").replace(/ /g, ' ');

const position = { paidIn: 300000, paidOut: -100000, unpaid: 0, unpaidCount: 0, unconvertedUnpaid: 0, left: 200000, paidPct: 33, pendingPct: 0 };
const totals = { paidIn: 300000, paidOut: -100000, net: 200000, stillToCome: 0, pendingCount: 0, projectedCount: 0, unconvertedCount: 0, transferCount: 0, count: 2 };

// The engine's figure for this fixture is fixed by its own tests (bo07.point1); here the cards only need one picture each, with a
// chosen leftAfterPlans, so the sign is set by the test.
function pictureFor(left: number): MonthPicture {
  const months = ['2026-08', '2026-09'].map((m) =>
    monthOf(m, [
      v3Line({ id: `p-${m}`, date: `${m}-25`, amount: 300_000, role: 'income' }),
      v3Line({ id: `e-${m}`, date: `${m}-12`, amount: 100_000 }),
    ]),
  );
  const base = monthPicture(prepare(inputsOf({ months: [...months, monthOf('2026-10', [], { full: false })], balance: minorUnits(250_000) })));
  return { ...base, leftAfterPlans: minorUnits(left) };
}

async function bothLines(picture: MonthPicture): Promise<{ home: string; decideLead: string; decideLabel: string }> {
  const left = Number(picture.leftAfterPlans);
  const home = await render(
    <ThemeProvider>
      <FontScaleProvider value={1}>
        <ThisMonthCard
          position={position}
          totals={totals}
          month="2026-10"
          months={['2026-10']}
          onMonthChange={jest.fn()}
          formatter={formatter}
          homeCurrency="USD"
          state="ready"
          currentMonth="2026-10"
          afterPlans={{ left }}
        />
      </FontScaleProvider>
    </ThemeProvider>,
  );
  const homeText = String(home.getByTestId('home-after-plans').props.children);
  await home.unmount();
  await wrap(
    <YourMonthCard
      picture={picture}
      bars={[] as unknown as MonthBar[]}
      thisMonth="2026-10"
      monthName={() => 'October'}
      formatMoney={fmtMinor}
      recordsUpTo={null}
      recordMonths={3}
      onRecords={() => undefined}
      wholeUnit={100}
    />,
  );
  const lead = screen.getByTestId('month-lead');
  const decideLabel = within(lead).getByTestId('month-lead-label').props.children as string;
  return { home: homeText, decideLead: lead.props.accessibilityLabel as string, decideLabel };
}

describe('Home line and Decide lead parity (05.5-14)', () => {
  it('a positive month: same amount, and Home carries the words of Decide’s lead label', async () => {
    const picture = pictureFor(15_000);
    expect(Number(picture.leftAfterPlans)).toBeGreaterThan(0);
    const { home, decideLead, decideLabel } = await bothLines(picture);
    const amount = fmtMinor(Number(picture.leftAfterPlans));
    const words = norm(String(i18n.t('decide.screens.home.month.leadLabel')));
    expect(norm(home)).toContain(amount);
    expect(norm(decideLead)).toContain(amount);
    expect(norm(decideLabel)).toBe(words);
    expect(norm(home)).toContain(words);
  });

  it('a below-zero month: Home says short, Decide says short, same absolute amount', async () => {
    const picture = pictureFor(-21_900);
    expect(Number(picture.leftAfterPlans)).toBeLessThan(0);
    const { home, decideLead } = await bothLines(picture);
    const amount = fmtMinor(Math.abs(Number(picture.leftAfterPlans)));
    const tail = norm(String(i18n.t('decide.screens.home.month.leadLabel'))).replace(/^left /, '');
    expect(norm(home)).toContain(`${amount} short ${tail}`);
    expect(norm(decideLead)).toContain(amount);
    expect(norm(decideLead)).toContain('short in');
  });
});
