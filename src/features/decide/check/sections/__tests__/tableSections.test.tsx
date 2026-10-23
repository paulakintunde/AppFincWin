import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { Assessment } from '@/engine/decide';
import { MonthSection } from '../MonthSection';
import { LedgersSection } from '../LedgersSection';
import { LinesSection } from '../LinesSection';
import { AssumptionsSection } from '../AssumptionsSection';
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
    expanded: true,
    onToggle: jest.fn(),
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

describe('MonthSection', () => {
  it('is collapsed by default and summarises Left at month end', async () => {
    await wrap(<MonthSection {...sectionProps(FITS, loggedSource(), { expanded: false })} />);
    expect(screen.getByText('The month, line by line')).toBeTruthy();
    expect(screen.getByText('Left at month end: $1800 now, $1800 after')).toBeTruthy();
    expect(screen.queryByText('Money in')).toBeNull();
  });

  it('rows are exact and add up for both columns', async () => {
    const p = sectionProps(FITS, loggedSource());
    await wrap(<MonthSection {...p} />);
    const { now, after } = assessment(p).monthTable;
    for (const c of [now, after]) {
      expect(c.income - c.outgoings).toBe(c.left);
      expect(c.living + c.debtPayments + c.savingInvesting + c.thisPurchase).toBe(c.outgoings);
    }
    expect(screen.getByLabelText(/^Money in, Now \$5000\.00, After \$5000\.00$/)).toBeTruthy();
    expect(screen.getByLabelText(/^Left at month end, Now \$1800\.00/)).toBeTruthy();
    expect(screen.getByText(/The month still closes with \$1800\.00 spare, on your average month\./)).toBeTruthy();
  });

  it('says how short the month is when it does not close', async () => {
    const loan: Partial<CheckInputs> = {
      advertised: 3_000_000,
      method: 'loan',
      loan: { deposit: 0, termMonths: 12, aprText: '10', secured: false, securedTouched: true, aprFromQuick: false, promo: null, variable: false },
    };
    await wrap(<MonthSection {...sectionProps(loan, loggedSource())} />);
    expect(screen.getByText(/The month would be \$\d+\.\d\d short/)).toBeTruthy();
  });

  it('renders nothing for a first read or no figures', async () => {
    await wrap(<MonthSection {...sectionProps(FITS, roughSource())} />);
    expect(screen.queryByText('The month, line by line')).toBeNull();
    await wrap(<MonthSection {...sectionProps(FITS, noneSource())} />);
    expect(screen.queryByText('The month, line by line')).toBeNull();
  });
});

describe('LedgersSection', () => {
  it('shows five ledgers with a direction word beside each dot', async () => {
    const p = sectionProps(FITS, loggedSource());
    await wrap(<LedgersSection {...p} />);
    expect(screen.getByText('Five ledgers')).toBeTruthy();
    for (const l of assessment(p).ledgers) {
      const word = { better: 'Better', worse: 'Worse', same: 'Same' }[l.direction];
      expect(screen.getAllByText(new RegExp(`· ${word}$`)).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Debt')).toBeTruthy();
  });

  it('IN-C02: each ledger row is read from the catalogue', async () => {
    await wrap(<LedgersSection {...sectionProps(FITS, loggedSource())} />);
    expect(screen.getAllByLabelText(/^Debt, now .+, after .+, (Better|Worse|Same)$/).length).toBe(1);
  });

  it('renders nothing without a logged verdict', async () => {
    await wrap(<LedgersSection {...sectionProps(FITS, roughSource())} />);
    expect(screen.queryByText('Where it lands')).toBeNull();
  });
});

describe('LinesSection', () => {
  it('lists six lines with words and counts clear and over', async () => {
    await wrap(<LinesSection {...sectionProps(FITS, loggedSource())} />);
    expect(screen.getByText('6 clear · 0 over')).toBeTruthy();
    expect(screen.getAllByText('Clear')).toHaveLength(6);
    expect(screen.getByText('Cash cushion')).toBeTruthy();
    expect(screen.getByText('Saving floor')).toBeTruthy();
  });

  it('names a short cash line with its amount', async () => {
    const p = sectionProps({ advertised: 1_150_000, method: 'cash' }, loggedSource());
    await wrap(<LinesSection {...p} />);
    expect(screen.getByText(/^Short \$\d+$/)).toBeTruthy();
    expect(screen.getByText('5 clear · 1 over')).toBeTruthy();
  });

  it('debt service with no money in reads as over the line', async () => {
    const base = sectionProps(FITS, loggedSource());
    const p = withAssessment(base, { debtServiceRatioAfter: null, checks: { ...assessment(base).checks, dsr: false }, debtServiceAfter: 20_000 as never });
    await wrap(<LinesSection {...p} />);
    expect(screen.getByText(/No money in on this basis, against your .* line/)).toBeTruthy();
    expect(screen.getByLabelText(/^Debt service, Over\./)).toBeTruthy();
  });

  it('IN-C03: a zero investing floor reads as no floor set; a set floor is named', async () => {
    const base = sectionProps(FITS, loggedSource());
    const a = assessment(base);
    const at = (floor: number) => withAssessment(base, { context: { ...a.context, limits: { ...a.context.limits, investingFloor: floor as never } } });
    const view = await wrap(<LinesSection {...at(0)} />);
    expect(screen.getByText(/a month, no floor set$/)).toBeTruthy();
    await view.unmount();
    await wrap(<LinesSection {...at(50_000)} />);
    expect(screen.getAllByText(/a month against your \$500 floor$/).length).toBeGreaterThan(0);
  });

  it('renders nothing without a logged verdict', async () => {
    await wrap(<LinesSection {...sectionProps(FITS, noneSource())} />);
    expect(screen.queryByText('Against your lines')).toBeNull();
  });
});

describe('AssumptionsSection', () => {
  const render = (meta: SnapshotMeta, source: SnapshotResult = loggedSource(), extra: { onEditCardMinimum?: () => void } = {}) =>
    wrap(<AssumptionsSection {...sectionProps(FITS, source)} meta={meta} {...extra} />);

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
    expect(screen.getByText('Assumptions in play')).toBeTruthy();
    expect(screen.getByText('0 assumptions')).toBeTruthy();
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
