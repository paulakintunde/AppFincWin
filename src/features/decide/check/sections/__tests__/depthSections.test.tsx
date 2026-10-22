import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { minorUnits } from '@/engine/money';
import { openEntry } from '@/features/record/entry/entryHost';
import { DayByDaySection } from '../DayByDaySection';
import { ExpectedIncomeSection } from '../ExpectedIncomeSection';
import { LinesSection } from '../LinesSection';
import { SetbacksSection } from '../SetbacksSection';
import { AssumptionsSection } from '../AssumptionsSection';
import type { SectionProps } from '../sectionUi';
import { ref } from '../../../copy/types';
import { buy, exact, stepProps, whole, wrap } from '../../steps/__tests__/helpers/stepProps';
import { META, loggedSource, month, roughSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import { EMPTY_STACK, type CheckComputation, type SnapshotResult } from '../../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/record/entry/entryHost', () => ({ openEntry: jest.fn() }));

type Loose = Record<string, unknown>;

/** Six steady full months and a confirmed pay series, so the engine has a cash path. */
function paySource(): SnapshotResult {
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m) => month(m, 500_000, 300_000));
  const pay = { seriesId: 's-pay', confirmed: true, freq: 'monthly', anchorDate: '2026-04-01', endDate: null, occurrenceCount: null, latestAmount: 500_000, currency: 'USD', lastPaidDate: '2026-10-01' } as never;
  const base = loggedSource({ cashOnHand: minorUnits(4_000_000), incomeSeries: [pay], months, monthlyInvesting: minorUnits(0), limits: { reserve: null, dsrLine: null, unsecuredIncomeMultiple: null, investingFloor: minorUnits(0), savingFloor: null, spareFloor: null } }, 4_000_000);
  return { ...base, meta: { ...base.meta, fullMonths: 6 } };
}

function sectionProps(source: SnapshotResult = paySource(), extra: Partial<SectionProps> = {}): SectionProps {
  const p = stepProps(buy({ advertised: 150_000, method: 'cash' }), {}, source);
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

/** Real computation with decision/verdict/incomeAtRisk fields overridden (the engine fields these paths read). */
function withFields(p: SectionProps, decisionOver: Loose = {}, verdictOver: Loose = {}, compOver: Loose = {}): SectionProps {
  const c = p.computation as unknown as { decision: Loose & { verdict: Loose }; verdict: Loose };
  const verdict = { ...c.verdict, ...verdictOver };
  const decision = { ...c.decision, ...decisionOver, verdict };
  return { ...p, computation: { ...p.computation, decision, verdict, ...compOver } as unknown as CheckComputation };
}

const formatDate = (d: string) => `on ${d}`;
const dayProps = (p: SectionProps) => ({ ...p, stack: EMPTY_STACK, formatDate });

describe('DayByDaySection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('summarises the lowest point and shows the chart text alternative', async () => {
    const p = sectionProps();
    expect(p.computation.status).toBe('logged');
    await wrap(<DayByDaySection {...dayProps(p)} />);
    expect(screen.getByText('Day by day, next 90 days')).toBeTruthy();
    // the collapsed-header summary and the always-visible text alternative (hidden from screen readers, IN-D03)
    expect(screen.getAllByText(/^Lowest with this: \$\d+ on on /, { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Lowest without:/, { includeHiddenElements: true }).length).toBeGreaterThan(0);
  });

  it('is collapsed by default behaviour: no chart while collapsed', async () => {
    await wrap(<DayByDaySection {...dayProps(sectionProps(paySource(), { expanded: false }))} />);
    expect(screen.queryByText(/Lowest without:/)).toBeNull();
  });

  it('states a dip before payday as a neutral fact, with the stacked wording when checks are stacked', async () => {
    const base = sectionProps();
    const verdict = base.computation.verdict as unknown as { cashPath: Loose };
    const cashPath = { ...verdict.cashPath, tightBeforePayday: { code: 'cash_tight_before_payday', date: '2026-11-01', amount: 12_000 } };
    const plain = withFields(base, {}, { cashPath });
    const view = await wrap(<DayByDaySection {...dayProps(plain)} />);
    expect(screen.getByText('Without this purchase, your cash is lowest on on 2026-11-01, at $120.')).toBeTruthy();
    await view.unmount();
    const stacked = withFields(base, { stacked: [{ status: 'applied' }] }, { cashPath });
    await wrap(<DayByDaySection {...dayProps(stacked)} />);
    expect(screen.getByText(/and with your other open checks/)).toBeTruthy();
  });

  it('with no pay series asks for one and opens Record on a money-in line', async () => {
    const p = sectionProps(loggedSource());
    await wrap(<DayByDaySection {...dayProps(p)} />);
    expect(screen.getAllByText('Add your pay as a recurring series').length).toBeGreaterThan(0);
    expect(screen.getByText('Add your pay as a recurring series to see day-by-day cash.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add a recurring series'));
    expect(openEntry).toHaveBeenCalledWith({ kind: 'new', direction: 'in' });
  });

  it('renders nothing for a first read', async () => {
    const view = await wrap(<DayByDaySection {...dayProps(sectionProps(roughSource()))} />);
    expect(view.toJSON()).not.toBeNull(); // only the provider wrapper
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not import the step composer files', () => {
    const fs = jest.requireActual('fs') as typeof import('fs');
    for (const f of ['DayByDaySection.tsx', 'ExpectedIncomeSection.tsx']) {
      const text = fs.readFileSync(`${__dirname}/../${f}`, 'utf8');
      expect(text).not.toMatch(/Step3Verdict|CheckFlowScreen/);
    }
  });
});

describe('ExpectedIncomeSection', () => {
  function raise(p: SectionProps): SectionProps {
    const verdict = p.computation.verdict as unknown as Loose & { context: Loose & { money: Loose } };
    const assessment = { ...verdict, state: 'fits', left: 90_000, context: { ...verdict.context, money: { ...verdict.context.money, incomeBasis: 540_000 } } };
    const outcome = {
      monthlyAmount: 40_000,
      likelihood: 'uncertain',
      startMonth: '2026-11',
      assessment,
      payback: { months: 31, totalCost: 150_000, extraIncome: 40_000, horizonMonths: 60 },
    };
    return withFields(p, { withExpectedIncome: outcome });
  }

  it('renders nothing without a raise', async () => {
    const view = await wrap(<ExpectedIncomeSection {...sectionProps()} />);
    expect(view.toJSON()).not.toBeNull(); // only the provider wrapper
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('reads the one-line outcome and expands to the six figures', async () => {
    await wrap(<ExpectedIncomeSection {...raise(sectionProps())} />);
    expect(screen.getByText('With the expected income')).toBeTruthy();
    expect(screen.getByText('With the expected $400 a month (uncertain): fits, pays for itself in 31 months.')).toBeTruthy();
    for (const label of ['Income with it', 'Month left', 'Pays for itself', 'Total cost', 'State', 'How sure']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('31 months')).toBeTruthy();
    expect(screen.getByText('$5400')).toBeTruthy();
  });

  it('is collapsed without its figures when not expanded', async () => {
    await wrap(<ExpectedIncomeSection {...raise(sectionProps(paySource(), { expanded: false }))} />);
    expect(screen.queryByText('Income with it')).toBeNull();
  });

  it('renders nothing for a first read', async () => {
    const view = await wrap(<ExpectedIncomeSection {...sectionProps(roughSource())} />);
    expect(view.toJSON()).not.toBeNull(); // only the provider wrapper
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('LinesSection depth rows', () => {
  it('names the cushion and why', async () => {
    await wrap(<LinesSection {...sectionProps()} />);
    expect(screen.getByText(/protected · \$\d+ left on the day · 3 months, because your income is steady/)).toBeTruthy();
  });

  it('reads misses by under a missed line', async () => {
    const margins = [{ line: 'cash', margin: -5_000, threshold: 100_000, base: 100_000, flag: null }];
    await wrap(<LinesSection {...withFields(sectionProps(), { margins })} />);
    expect(screen.getByText('misses by $50')).toBeTruthy();
  });

  it('reads holds by under a line on the edge', async () => {
    const margins = [{ line: 'month', margin: 2_000, threshold: 0, base: 300_000, flag: 'on_edge' }];
    await wrap(<LinesSection {...withFields(sectionProps(), { margins })} />);
    expect(screen.getByText('holds by $20')).toBeTruthy();
  });

  it('reads the tight-before-payday fact for a zero cash-path margin on the edge', async () => {
    const base = sectionProps();
    const verdict = base.computation.verdict as unknown as { cashPath: Loose };
    const cashPath = { ...verdict.cashPath, tightBeforePayday: { code: 'cash_tight_before_payday', date: '2026-11-01', amount: 12_000 } };
    const margins = [{ line: 'cash_path', margin: 0, threshold: 0, base: 0, flag: 'on_edge' }];
    await wrap(<LinesSection {...withFields(base, { margins }, { cashPath })} />);
    expect(screen.getByText('Without this purchase, your cash is lowest on on 2026-11-01, at $120.')).toBeTruthy();
  });

  it('shows no margin line on a comfortable line', async () => {
    const margins = [{ line: 'cash', margin: 90_000, threshold: 100_000, base: 100_000, flag: null }];
    await wrap(<LinesSection {...withFields(sectionProps(), { margins })} />);
    expect(screen.queryByText(/holds by|misses by/)).toBeNull();
  });
});

describe('SetbacksSection runway', () => {
  const setbackRows = [
    { code: 'unexpected_expense', enabled: false, paymentsMet: true },
    { code: 'income_drop', enabled: false, paymentsMet: false },
    { code: 'job_loss', enabled: false, paymentsMet: true },
    { code: 'late_invoice', enabled: false, paymentsMet: true },
  ];
  const risk = { runwayWith: 3, runwayWithout: 5, runwayLost: 2, setbacks: setbackRows };

  it('states the runway lost and per-setback whether new payments are met', async () => {
    await wrap(<SetbacksSection {...withFields(sectionProps(), {}, {}, { incomeAtRisk: risk })} />);
    expect(screen.getByText('Runway 3 months, 2 less because of this')).toBeTruthy();
    expect(screen.getByText('Runway lost to this purchase: 2 months')).toBeTruthy();
    expect(screen.getAllByText('New payments still met')).toHaveLength(3);
    expect(screen.getAllByText('New payments cannot be met')).toHaveLength(1);
  });

  it('keeps the plain runway summary when nothing was lost', async () => {
    const calm = { ...risk, runwayLost: 0 };
    await wrap(<SetbacksSection {...withFields(sectionProps(), {}, {}, { incomeAtRisk: calm })} />);
    expect(screen.queryByText(/Runway lost to this purchase/)).toBeNull();
    expect(screen.queryByText(/less because of this/)).toBeNull();
  });
});

describe('AssumptionsSection new rows', () => {
  const rowCount = (): number => {
    const summary = screen.getByText(/^\d+ assumptions?$/);
    return Number((summary.props.children as string).split(' ')[0]);
  };
  const base = (extra: Record<string, unknown> = {}) => ({ ...sectionProps(), meta: META, ...extra });

  it('adds nothing for the demo-like fixture', async () => {
    const view = await wrap(<AssumptionsSection {...base()} />);
    const plain = rowCount();
    await view.unmount();
    await wrap(<AssumptionsSection {...base({ stack: EMPTY_STACK, conversions: [], basisItems: [], formatDate })} />);
    expect(rowCount()).toBe(plain);
  });

  it('adds one row per converted currency and the stamped-rate row', async () => {
    const conversions = [
      { currency: 'EUR', rateText: '1.47', rateDate: '2026-10-14' },
      { currency: 'GBP', rateText: '1.31', rateDate: '2026-10-14' },
    ];
    await wrap(<AssumptionsSection {...base({ conversions, formatDate })} />);
    expect(screen.getByText('EUR at 1.47 on on 2026-10-14')).toBeTruthy();
    expect(screen.getByText('GBP at 1.31 on on 2026-10-14')).toBeTruthy();
    expect(screen.getByText('Past lines keep the rate they were stamped with')).toBeTruthy();
  });

  it('counts the open checks left out, and has no deferred-interest row', async () => {
    const stack = { ...EMPTY_STACK, leftOutIncomplete: 1, leftOutCurrency: 2 };
    await wrap(<AssumptionsSection {...base({ stack })} />);
    expect(screen.getByText('1 open check not counted: no price yet')).toBeTruthy();
    expect(screen.getByText('2 open checks not counted: their amounts are in another currency')).toBeTruthy();
    expect(screen.queryByText(/deferred/i)).toBeNull();
  });

  it('lists the basis facts in full except the card minimum item', async () => {
    const basisItems = [ref('decide.depth.cashPath.basisUnavailable'), ref('decide.depth.cardMin.basis')];
    await wrap(<AssumptionsSection {...base({ basisItems })} />);
    expect(screen.getAllByText('Cash path unavailable').length).toBe(1);
    expect(screen.queryByText(/card minimum/i)).toBeNull();
  });
});
