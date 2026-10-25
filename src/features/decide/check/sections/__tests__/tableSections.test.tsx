import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { Assessment } from '@/engine/decide';
import { MonthBody } from '../MonthSection';
import { LedgersBody } from '../LedgersSection';
import { EveryLineRows } from '../LinesSection';
import { AssumptionsBody } from '../AssumptionsSection';
import type { SectionProps } from '../sectionUi';
import { buy, exact, stepProps, whole, wrap } from '../../steps/__tests__/helpers/stepProps';
import { META, loggedSource, noneSource, roughSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import type { CheckInputs, SnapshotMeta, SnapshotResult } from '../../../snapshot/types';

jest.setTimeout(30000);

function sectionProps(over: Partial<CheckInputs>, source: SnapshotResult, extra: Partial<SectionProps> = {}): SectionProps {
  const p = stepProps(buy(over), {}, source);
  return {
    computation: p.computation,
    inputs: p.inputs,
    update: jest.fn(),
    whole,
    exact,
    currency: 'USD',
    readOnly: false,
    ...extra,
  };
}
const FITS: Partial<CheckInputs> = { advertised: 150_000, method: 'cash' };
const assessment = (p: SectionProps): Assessment => p.computation.verdict as Assessment;
const withAssessment = (p: SectionProps, patch: Partial<Assessment>): SectionProps => ({
  ...p,
  computation: { ...p.computation, verdict: { ...assessment(p), ...patch } as Assessment },
});
const metaWith = (over: Partial<SnapshotMeta>): SnapshotMeta => ({ ...META, ...over });

const onMonthBasis = (p: SectionProps): SectionProps => {
  const ctx = assessment(p).context;
  return withAssessment(p, { context: { ...ctx, money: { ...ctx.money, basis: 'month' } } });
};

describe('D-107 the month basis in the sections', () => {
  it('D-107 the month table note and closing line name this month', async () => {
    await wrap(<MonthBody {...onMonthBasis(sectionProps(FITS, loggedSource()))} />);
    expect(screen.getByText('Money in this month, against everything that leaves.')).toBeTruthy();
    expect(screen.getByText(/The month still closes with \$1800\.00 spare, as this month is expected to end\./)).toBeTruthy();
    expect(screen.queryByText(/your average month|your worst month/i)).toBeNull();
  });

  it('D-107 the Assumptions income row says judged on this month', async () => {
    const p = { ...onMonthBasis(sectionProps(FITS, loggedSource())), meta: META };
    await wrap(<AssumptionsBody {...p} />);
    expect(screen.getByText(/months? logged · .* · judged on this month$/)).toBeTruthy();
  });
});

describe('MonthBody', () => {
  it('D-106 the month table result row prints free / overspent words; rows are exact and add up for both columns', async () => {
    const p = sectionProps(FITS, loggedSource());
    await wrap(<MonthBody {...p} />);
    const { now, after } = assessment(p).monthTable;
    for (const c of [now, after]) {
      expect(c.income - c.outgoings).toBe(c.left);
      expect(c.living + c.debtPayments + c.savingInvesting + c.thisPurchase).toBe(c.outgoings);
    }
    expect(screen.getByLabelText(/^Money in, Now \$5000\.00, After \$5000\.00$/)).toBeTruthy();
    expect(screen.getByLabelText(/^Month end, Now \$1800\.00 free, After \$1800\.00 free/)).toBeTruthy(); // D-106: the result row prints free words
    expect(screen.getByText(/The month still closes with \$1800\.00 spare, on your average month\./)).toBeTruthy();
  });

  it('D-106 the Month closes line says overspent for a negative month', async () => {
    const loan: Partial<CheckInputs> = {
      advertised: 3_000_000,
      method: 'loan',
      loan: { deposit: 0, termMonths: 12, aprText: '10', secured: false, securedTouched: true, aprFromQuick: false, promo: null, variable: false },
    };
    await wrap(<MonthBody {...sectionProps(loan, loggedSource())} />);
    expect(screen.getByText(/The month would be \$\d+\.\d\d overspent\./)).toBeTruthy();
    expect(screen.getByLabelText(/^Month end, Now \$\d+\.\d\d free, After \$\d+\.\d\d overspent$/)).toBeTruthy();
    expect(screen.queryByText(/short/)).toBeNull();
  });

  it('renders nothing for a first read or no figures', async () => {
    await wrap(<MonthBody {...sectionProps(FITS, roughSource())} />);
    expect(screen.queryByText('The month, line by line')).toBeNull();
    await wrap(<MonthBody {...sectionProps(FITS, noneSource())} />);
    expect(screen.queryByText('The month, line by line')).toBeNull();
  });
});

describe('LedgersBody', () => {
  it('shows five ledgers with a direction word beside each dot', async () => {
    const p = sectionProps(FITS, loggedSource());
    await wrap(<LedgersBody {...p} />);
    for (const l of assessment(p).ledgers) {
      const word = { better: 'Better', worse: 'Worse', same: 'Same' }[l.direction];
      expect(screen.getAllByText(word).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Debt')).toBeTruthy();
  });

  it('IN-C02: each ledger row is read from the catalogue', async () => {
    await wrap(<LedgersBody {...sectionProps(FITS, loggedSource())} />);
    expect(screen.getAllByLabelText(/^Debt, now .+, after .+, (Better|Worse|Same)$/).length).toBe(1);
  });

  it('renders nothing without a logged verdict', async () => {
    await wrap(<LedgersBody {...sectionProps(FITS, roughSource())} />);
    expect(screen.queryByText('Where it lands')).toBeNull();
  });
});

describe('EveryLineRows', () => {
  it('lists six lines with words', async () => {
    await wrap(<EveryLineRows {...sectionProps(FITS, loggedSource())} />);
    expect(screen.getAllByText('Clear')).toHaveLength(6);
    expect(screen.getByText('Cash cushion')).toBeTruthy();
    expect(screen.getByText('Saving floor')).toBeTruthy();
    // D-70: the label sits in an InfoTitle beside its ⓘ (five of the six rows carry one)
    expect(screen.getAllByLabelText(/^About /)).toHaveLength(5);
  });

  it('D-106 the month line says overspent and the cash line still says Short', async () => {
    const loan: Partial<CheckInputs> = {
      advertised: 3_000_000,
      method: 'loan',
      loan: { deposit: 0, termMonths: 12, aprText: '10', secured: false, securedTouched: true, aprFromQuick: false, promo: null, variable: false },
    };
    await wrap(<EveryLineRows {...sectionProps(loan, loggedSource())} />);
    expect(screen.getByText(/^\$[\d,]+ overspent at month end$/)).toBeTruthy();
    expect(screen.getByText(/^Overspent \$[\d,]+$/)).toBeTruthy();
    expect(screen.queryByText(/left at month end/)).toBeNull();
  });

  it('D-106 a month that closes reads free at month end', async () => {
    await wrap(<EveryLineRows {...sectionProps(FITS, loggedSource())} />);
    expect(screen.getByText(/^\$[\d,]+ free at month end$/)).toBeTruthy();
  });

  it('D-106 the cash line still says Short: names a short cash line with its amount', async () => {
    const p = sectionProps({ advertised: 1_150_000, method: 'cash' }, loggedSource());
    await wrap(<EveryLineRows {...p} />);
    expect(screen.getByText(/^Short \$\d+$/)).toBeTruthy();
  });

  it('debt service with no money in reads as over the line', async () => {
    const base = sectionProps(FITS, loggedSource());
    const p = withAssessment(base, { debtServiceRatioAfter: null, checks: { ...assessment(base).checks, dsr: false }, debtServiceAfter: 20_000 as never });
    await wrap(<EveryLineRows {...p} />);
    expect(screen.getByText(/No money in on this basis, against your .* line/)).toBeTruthy();
    expect(screen.getByLabelText(/^Debt service, Over\./)).toBeTruthy();
  });

  it('IN-C03: a zero investing floor reads as no floor set; a set floor is named', async () => {
    const base = sectionProps(FITS, loggedSource());
    const a = assessment(base);
    const at = (floor: number) => withAssessment(base, { context: { ...a.context, limits: { ...a.context.limits, investingFloor: floor as never } } });
    const view = await wrap(<EveryLineRows {...at(0)} />);
    expect(screen.getByText(/a month, no floor set$/)).toBeTruthy();
    await view.unmount();
    await wrap(<EveryLineRows {...at(50_000)} />);
    expect(screen.getAllByText(/a month against your \$500 floor$/).length).toBeGreaterThan(0);
  });

  it('renders nothing without a logged verdict', async () => {
    await wrap(<EveryLineRows {...sectionProps(FITS, noneSource())} />);
    expect(screen.queryByText('Against your lines')).toBeNull();
  });
});

describe('AssumptionsBody', () => {
  const render = (meta: SnapshotMeta, source: SnapshotResult = loggedSource(), extra: { onEditCardMinimum?: () => void } = {}) =>
    wrap(<AssumptionsBody {...sectionProps(FITS, source)} meta={meta} {...extra} />);

  it('lists the money in, expenses, debt and return rows plus the not-a-lender line', async () => {
    await render(META);
    expect(screen.getByText('Money in')).toBeTruthy();
    expect(screen.getByText('4 months logged · Steady · average')).toBeTruthy();
    expect(screen.getByText('$3000 a month')).toBeTruthy();
    expect(screen.getByText('0% unless you entered one')).toBeTruthy();
    expect(screen.getByText(/does not lend money/)).toBeTruthy();
  });

  it('still renders with only the not-a-lender line when there is no verdict', async () => {
    await render(META, noneSource());
    expect(screen.getByText(/does not lend money/)).toBeTruthy();
  });

  it('the debt row counts one account in the singular', async () => {
    await render(metaWith({ debtCount: 1 }));
    expect(screen.getByText(/^1 account · .+ unsecured$/)).toBeTruthy();
    expect(screen.queryByText(/1 accounts/)).toBeNull();
  });

  it('the debt row counts two accounts in the plural', async () => {
    await render(metaWith({ debtCount: 2 }));
    expect(screen.getByText(/^2 accounts · .+ unsecured$/)).toBeTruthy();
  });

  it('names lines without a rate and derived balances', async () => {
    await render(metaWith({ unconvertedRows: 2, derivedDebts: 1 }));
    expect(screen.getByText('Lines without a rate')).toBeTruthy();
    expect(screen.getByText('2 lines left out')).toBeTruthy();
    await fireEvent.press(screen.getByText('Show details'));
    expect(screen.getByText('1 balance counted as debt')).toBeTruthy();
  });

  it('a card with no minimum is named in assumptions', async () => {
    await render(metaWith({ cardsWithoutMinimum: 1 }));
    expect(screen.getByText('Card payments')).toBeTruthy();
    expect(screen.getByText('Card payments aren’t counted until the minimum is set.')).toBeTruthy();
  });

  it('a minimum counted without a rate is named', async () => {
    await render(metaWith({ cardsMinimumWithoutRate: 1 }));
    expect(screen.getByText('Card interest')).toBeTruthy();
    expect(screen.getByText('Card minimums are counted without interest until the card’s rate is set.')).toBeTruthy();
  });

  it('a loan with no payment is named in assumptions', async () => {
    await render(metaWith({ loansWithoutPayment: 2 }));
    expect(screen.getByText('Loan payments')).toBeTruthy();
    expect(screen.getByText(/2 loan balances have no repeating payment on them/)).toBeTruthy();
  });

  it('the card payments row opens the card terms', async () => {
    const onEdit = jest.fn();
    await render(metaWith({ cardsWithoutMinimum: 1 }), loggedSource(), { onEditCardMinimum: onEdit });
    await fireEvent.press(screen.getByRole('button', { name: /Card payments/ }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/Card payments/).props.accessibilityHint).toBe('Opens the card minimum payment');
  });

  it('the card payments row is plain without a handler', async () => {
    await render(metaWith({ cardsWithoutMinimum: 1 }));
    expect(screen.queryByRole('button', { name: /Card payments/ })).toBeNull();
  });
});
