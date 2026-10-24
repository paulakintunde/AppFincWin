import React from 'react';
import { screen } from '@testing-library/react-native';
import { carInputs, demoSource, sofaInputs } from '@/features/decide/__tests__/helpers/demoScenario';
import { Step3Verdict, type Step3Props } from '../steps/Step3Verdict';
import { stepProps, wrap } from '../steps/__tests__/helpers/stepProps';
import { buildDecideSnapshot } from '../../snapshot/buildSnapshot';
import { computeCheck } from '../../snapshot/computeCheck';
import { roughSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import type { CheckInputs, SnapshotResult } from '../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSuccess: jest.fn(), hapticWarning: jest.fn(), hapticSelection: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const NBSP = ' ';
const TODAY = '2026-10-15';
const source = (): SnapshotResult => buildDecideSnapshot(demoSource(TODAY));
const car60: CheckInputs = { ...carInputs, loan: { ...carInputs.loan, termMonths: 60 } };

function propsOf(inputs: CheckInputs, src: SnapshotResult = source()): Step3Props {
  return { ...stepProps(inputs, {}, src), lastSeenBasis: null, revealKey: 'k' };
}

/** All text children of the rendered tree, in tree order. */
function texts(tree: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (n === null || n === undefined) return;
    if (typeof n === 'string') {
      out.push(n);
      return;
    }
    (((n as { children?: unknown[] | null }).children) ?? []).forEach(walk);
  };
  walk(tree);
  return out;
}
const indexOf = (all: string[], re: RegExp): number => all.findIndex((s) => re.test(s));

describe('VerdictCard rows 4b and 4c (05-128)', () => {
  it('D-102 the sofa frame shows no total-cost row', async () => {
    await wrap(<Step3Verdict {...propsOf(sofaInputs)} />);
    expect(screen.queryByTestId('verdict-tco')).toBeNull();
    expect(screen.queryByTestId('verdict-invested')).toBeNull();
    expect(screen.queryByText(/ in all$/)).toBeNull();
    expect(screen.queryByLabelText('About Total cost')).toBeNull();
  });

  it('D-102 the car loan frame shows Over 5 years in all above the basis marker', async () => {
    const view = await wrap(<Step3Verdict {...propsOf(car60)} />);
    expect(screen.getByTestId('verdict-tco')).toBeTruthy();
    const all = texts(view.toJSON());
    const row = indexOf(all, new RegExp(`^Over 5${NBSP}years: [$][0-9]+ in all$`));
    const basis = indexOf(all, /Average month|Worst month|Your worst month|Your average month/);
    expect(row).toBeGreaterThanOrEqual(0);
    expect(basis).toBeGreaterThan(row);
    expect(screen.getByLabelText('About Total cost')).toBeTruthy();
    // the ⓘ is the row's next flex sibling, and the sentence is not clamped
    const text = screen.getByText(/^Over 5.years/);
    expect(text.props.numberOfLines).toBeUndefined();
  });

  it('D-102 the key-figures group reads figures, then the total cost', async () => {
    await wrap(<Step3Verdict {...propsOf(car60)} />);
    expect(screen.getByLabelText(new RegExp(`^Left each month after this: .*Monthly cost: .*[.] Over 5.years, [0-9]+ dollars in all$`))).toBeTruthy();
  });

  it('D-104 invested instead shows only when a non-zero rate is typed', async () => {
    await wrap(<Step3Verdict {...propsOf({ ...car60, projectionRates: ['0'] })} />);
    expect(screen.queryByTestId('verdict-invested')).toBeNull();
    expect(screen.queryByText(/^Invested instead/)).toBeNull();
    await wrap(<Step3Verdict {...propsOf({ ...car60, projectionRates: ['0', '7'] })} />);
    expect(screen.getByText(new RegExp(`^Invested instead: [$][0-9]+ after 5.years at 7%$`))).toBeTruthy();
    expect(screen.getByLabelText('About Invested instead')).toBeTruthy();
    expect(screen.getByLabelText(/Invested instead: [0-9]+ dollars after 5.years at 7%[.] A projection, not a forecast$/)).toBeTruthy();
  });

  it('D-104 a typed holding fee reads the fee variant', async () => {
    await wrap(<Step3Verdict {...propsOf({ ...car60, projectionRates: ['0', '7'], investHoldingFeeText: '0.5' })} />);
    expect(screen.getByText(new RegExp(`at 7%, less 0[.]5% fees$`))).toBeTruthy();
  });

  it('D-104 invested instead sits under the key figures when total cost is hidden', async () => {
    const view = await wrap(<Step3Verdict {...propsOf({ ...sofaInputs, projectionRates: ['0', '7'] })} />);
    expect(screen.queryByTestId('verdict-tco')).toBeNull();
    const all = texts(view.toJSON());
    const cushion = indexOf(all, /^Cushion$/);
    const invested = indexOf(all, /^Invested instead/);
    const basis = indexOf(all, /Average month|Worst month|Your worst month|Your average month/);
    expect(invested).toBeGreaterThan(cushion);
    expect(basis).toBeGreaterThan(invested);
  });

  it('D-102 a first read shows neither row (the engine gives no total without a verdict)', async () => {
    await wrap(<Step3Verdict {...propsOf({ ...car60, projectionRates: ['0', '7'] }, roughSource())} />);
    expect(screen.queryByTestId('verdict-ownership')).toBeNull();
  });

  it('D-104 while the settled core recomputes the rows keep their last value with Updating', async () => {
    const p = propsOf({ ...car60, projectionRates: ['0', '7'] });
    const view = await wrap(<Step3Verdict {...p} busy />);
    const before = texts(view.toJSON()).filter((s) => /in all$|^Invested instead/.test(s));
    expect(before).toHaveLength(2);
    expect(screen.getByTestId('verdict-ownership').props.accessibilityState).toEqual({ busy: true });
    // the live verdict changes (typing) while the slow figures are still the last ones: the rows are unchanged
    const live = { ...p.computation, verdict: p.computation.verdict, totalCost: p.computation.totalCost, investmentViews: p.computation.investmentViews };
    await view.rerender(<Step3Verdict {...p} computation={live} busy />);
    expect(texts(view.toJSON()).filter((s) => /in all$|^Invested instead/.test(s))).toEqual(before);
    await view.rerender(<Step3Verdict {...p} busy={false} />);
    expect(screen.getByTestId('verdict-ownership').props.accessibilityState).toEqual({ busy: false });
    expect(texts(view.toJSON()).filter((s) => /in all$|^Invested instead/.test(s))).toEqual(before);
  });

  it('D-102 a missing verdict or no totals hides both rows', async () => {
    const p = propsOf({ ...car60, projectionRates: ['0', '7'] });
    const none = { ...p.computation, totalCost: null, investmentViews: p.computation.investmentViews && { ...p.computation.investmentViews, headline: null } };
    await wrap(<Step3Verdict {...p} computation={none} />);
    expect(screen.queryByTestId('verdict-ownership')).toBeNull();
    // out of range / null plan total: the engine's null reaches the card as no row
    expect(computeCheck(source(), { ...car60, advertised: car60.advertised }).totalCost).not.toBeNull();
  });
});
