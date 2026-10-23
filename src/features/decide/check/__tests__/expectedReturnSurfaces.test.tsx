import React from 'react';
import { screen } from '@testing-library/react-native';
import { minorUnits } from '@/engine/money';
import { Step3Verdict, type Step3Props } from '../steps/Step3Verdict';
import { AssumptionsBody } from '../sections/AssumptionsSection';
import { buy, exact, stepProps, whole, wrap } from '../steps/__tests__/helpers/stepProps';
import { META, TODAY, loggedSource, month } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { computeCheck } from '../../snapshot/computeCheck';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import type { CheckInputs, SnapshotResult } from '../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSuccess: jest.fn(), hapticWarning: jest.fn(), hapticSelection: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

type Loose = { props?: Record<string, unknown>; children?: (Loose | string)[] | null };

function strongSource(): SnapshotResult {
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m) => month(m, 500_000, 300_000));
  const pay = { seriesId: 's-pay', confirmed: true, freq: 'monthly', anchorDate: '2026-04-01', endDate: null, occurrenceCount: null, latestAmount: 500_000, currency: 'USD', lastPaidDate: '2026-10-01' } as never;
  const base = loggedSource({ cashOnHand: minorUnits(4_000_000), incomeSeries: [pay], months, monthlyInvesting: minorUnits(0), limits: { reserve: null, dsrLine: null, unsecuredIncomeMultiple: null, investingFloor: minorUnits(0), savingFloor: null, spareFloor: null } }, 4_000_000);
  return { ...base, meta: { ...base.meta, fullMonths: 6 } };
}

const invest = (over: Partial<CheckInputs> = {}): CheckInputs => ({ ...emptyCheckInputs('invest', TODAY), name: 'Fund', advertised: 100_000, method: 'lump', ...over });

function verdictProps(inputs: CheckInputs): Step3Props {
  return { ...stepProps(inputs, {}, strongSource()), lastSeenBasis: null, revealKey: 'k1' };
}

const LINE = /^At 5% a year: about \$\d+ after 60 months\. Not a forecast\.$/;

/** Every host node's props, in tree order, for ordering checks. */
function texts(): string[] {
  const out: string[] = [];
  const walk = (n: Loose | Loose[] | string | null) => {
    if (n === null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return n.forEach(walk);
    (n.children ?? []).forEach(walk);
  };
  walk(screen.toJSON() as Loose | Loose[] | null);
  return out;
}

describe('Expected return surfaces (05-87, D-82)', () => {
  it('D-82 the verdict line follows the basis marker on investment checks', async () => {
    await wrap(<Step3Verdict {...verdictProps(invest({ investReturnText: '5' }))} />);
    const line = screen.getByText(LINE);
    expect(line).toBeTruthy();
    const all = texts();
    const basis = all.findIndex((s) => s.startsWith('Average month') || s.includes('month'));
    expect(all.indexOf(line.props.children as string)).toBeGreaterThan(basis);
    expect(all.at(-1)).toBe(line.props.children);
  });

  it('D-82 the line is read in the key-figures group', async () => {
    await wrap(<Step3Verdict {...verdictProps(invest({ investReturnText: '5' }))} />);
    expect(screen.getByLabelText(/Cushion: .*\. At 5% a year: about \$\d+ after 60 months\. Not a forecast$/)).toBeTruthy();
  });

  it('D-82 the horizon the user picks is the one projected', async () => {
    await wrap(<Step3Verdict {...verdictProps(invest({ investReturnText: '5', lumpHorizonMonths: 120 }))} />);
    expect(screen.getByText(/^At 5% a year: about \$\d+ after 120 months\. Not a forecast\.$/)).toBeTruthy();
  });

  it('D-82 Assumptions lists the expected return', async () => {
    const p = stepProps(invest({ investReturnText: '5' }), {}, strongSource());
    await wrap(<AssumptionsBody computation={p.computation} inputs={p.inputs} update={jest.fn()} whole={whole} exact={exact} currency="USD" readOnly={false} meta={META} />);
    expect(screen.getByText('Expected return')).toBeTruthy();
    expect(screen.getByText('5% a year, used for the projection only')).toBeTruthy();
  });

  it('D-82 nothing shows without a return', async () => {
    const view = await wrap(<Step3Verdict {...verdictProps(invest())} />);
    expect(screen.queryByText(/Not a forecast/)).toBeNull();
    const p = stepProps(invest(), {}, strongSource());
    await view.rerender(<AssumptionsBody computation={p.computation} inputs={p.inputs} update={jest.fn()} whole={whole} exact={exact} currency="USD" readOnly={false} meta={META} />);
    expect(screen.queryByText('Expected return')).toBeNull();
  });

  it('D-82 a purchase check shows no line and no row even with a stray return', async () => {
    const inputs = buy({ investReturnText: '5' });
    const view = await wrap(<Step3Verdict {...verdictProps(inputs)} />);
    expect(screen.queryByText(/Not a forecast/)).toBeNull();
    const p = stepProps(inputs, {}, strongSource());
    await view.rerender(<AssumptionsBody computation={p.computation} inputs={p.inputs} update={jest.fn()} whole={whole} exact={exact} currency="USD" readOnly={false} meta={META} />);
    expect(screen.queryByText('Expected return')).toBeNull();
  });

  it('D-82 the expected return never changes the verdict, warnings, month, alternatives or decision', () => {
    const source = strongSource();
    for (const base of [invest(), invest({ method: 'monthly', advertised: 20_000, investTermMonths: 24 }), invest({ advertised: 9_000_000 })]) {
      const without = computeCheck(source, { ...base, investReturnText: null });
      for (const rate of ['0', '5', '100']) {
        const withReturn = computeCheck(source, { ...base, investReturnText: rate });
        expect(withReturn.verdict).toEqual(without.verdict);
        expect(withReturn.decision).toEqual(without.decision);
        expect(withReturn.alternatives).toEqual(without.alternatives);
        expect(withReturn.options).toEqual(without.options);
        expect(withReturn.setbacks).toEqual(without.setbacks);
        expect(withReturn.waitPlan).toEqual(without.waitPlan);
      }
    }
  });

  it('D-82 the verdict card reads the same state words with and without a return', async () => {
    const view = await wrap(<Step3Verdict {...verdictProps(invest())} />);
    expect(await screen.findByLabelText(/^It fits./)).toBeTruthy();
    await view.rerender(<Step3Verdict {...verdictProps(invest({ investReturnText: '5' }))} />);
    expect(await screen.findByLabelText(/^It fits./)).toBeTruthy();
  });

  it('D-82 a projection beyond the supported range reads Too large to project at this rate', async () => {
    await wrap(<Step3Verdict {...verdictProps(invest({ investReturnText: '100', lumpHorizonMonths: 600 }))} />);
    expect(screen.getByText('Too large to project at this rate')).toBeTruthy();
    expect(screen.queryByText(/Not a forecast/)).toBeNull();
    expect(screen.getByLabelText(/Cushion: .*. Too large to project at this rate$/)).toBeTruthy();
  });
});
