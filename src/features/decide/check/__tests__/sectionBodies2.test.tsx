import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { openEntry } from '@/features/record/entry/entryHost';
import * as textFit from '../../ui/textFit';
import { DayByDayBody } from '../sections/DayByDaySection';
import { OptionsBody } from '../sections/OptionsSection';
import { SetbacksBody } from '../sections/SetbacksSection';
import { ExpectedIncomeBody } from '../sections/ExpectedIncomeSection';
import { WhoPaysBody } from '../sections/WhoPaysSection';
import type { SectionProps } from '../sections/sectionUi';
import { buy, exact, stepProps, whole, wrap } from '../steps/__tests__/helpers/stepProps';
import { loggedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { EMPTY_STACK, type CheckComputation, type CheckInputs } from '../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/record/entry/entryHost', () => ({ openEntry: jest.fn() }));

const CASH_NO: Partial<CheckInputs> = { advertised: 3_000_000, method: 'cash' };
const LOAN_NO: Partial<CheckInputs> = {
  advertised: 3_000_000,
  method: 'loan',
  loan: { deposit: 0, termMonths: 12, aprText: '10', secured: false, securedTouched: true, aprFromQuick: false, promo: null, variable: false },
};

function bodyProps(over: Partial<CheckInputs>): SectionProps {
  const p = stepProps(buy(over), {}, loggedSource());
  return { computation: p.computation, inputs: p.inputs, update: jest.fn(), whole, exact, currency: 'USD', readOnly: false };
}

/** Real computation with a raise set, as depthSections does. */
function withRaise(p: SectionProps): SectionProps {
  const c = p.computation as unknown as { decision: Record<string, unknown>; verdict: { context: { money: Record<string, unknown> } } };
  const verdict = c.verdict as unknown as Record<string, unknown> & { context: Record<string, unknown> & { money: Record<string, unknown> } };
  const assessment = { ...verdict, state: 'fits', left: 90_000, context: { ...verdict.context, money: { ...verdict.context.money, incomeBasis: 540_000 } } };
  const outcome = {
    monthlyAmount: 40_000,
    likelihood: 'uncertain',
    startMonth: '2026-11',
    assessment,
    payback: { months: 31, totalCost: 150_000, extraIncome: 40_000, horizonMonths: 60 },
  };
  return { ...p, computation: { ...p.computation, decision: { ...c.decision, withExpectedIncome: outcome } } as unknown as CheckComputation };
}

const formatDate = (d: string) => `on ${d}`;

type Json = { props?: Record<string, unknown>; children?: (Json | string)[] | null };
/** Every rendered host node matching `pred`. */
function nodes(pred: (props: Record<string, unknown>) => boolean): Json[] {
  const out: Json[] = [];
  const walk = (n: Json | Json[] | string | null) => {
    if (n === null || typeof n === 'string') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (pred(n.props ?? {})) out.push(n);
    (n.children ?? []).forEach(walk);
  };
  walk(screen.toJSON() as Json | Json[] | null);
  return out;
}
/** Host nodes that clamp their text. */
const clamped = () => nodes((p) => p.numberOfLines !== undefined);

describe('Cash path and options bodies', () => {
  beforeEach(() => jest.clearAllMocks());

  it('D-74 cash path without a pay series reads declaratively and links to Record', async () => {
    await wrap(<DayByDayBody {...bodyProps(CASH_NO)} stack={EMPTY_STACK} formatDate={formatDate} />);
    expect(screen.getByText('Day-by-day cash needs your pay as a recurring series.')).toBeTruthy();
    const link = screen.getByLabelText('Recurring series in Record');
    expect(link.props.accessibilityRole).toBe('link');
    await fireEvent.press(link);
    expect(openEntry).toHaveBeenCalledWith({ kind: 'new', direction: 'in' });
  });

  it('R1 options render in an inner ink tile', async () => {
    const p = bodyProps(LOAN_NO);
    await wrap(<OptionsBody {...p} onOpenActivity={jest.fn()} onSwitchToWait={jest.fn()} lineName={(id) => id} />);
    const tile = nodes((p) => JSON.stringify(p.style ?? null).includes('"borderRadius":16'));
    expect(tile.length).toBeGreaterThan(0);
    expect(JSON.stringify(tile[0]!.props!.style)).toContain('backgroundColor');
    expect(screen.getByText(/more a month coming in$/)).toBeTruthy();
  });
});

describe('Setbacks, expected income and who pays bodies', () => {
  afterEach(() => jest.restoreAllMocks());

  it('D-76 setbacks, expected income and who pays wrap with no clamps', async () => {
    jest.spyOn(textFit, 'useShouldStack').mockReturnValue(true);
    const base = bodyProps(CASH_NO);
    const bodies: [string, React.ReactElement][] = [
      ['setbacks', <SetbacksBody key="s" {...base} />],
      ['income', <ExpectedIncomeBody key="i" {...withRaise(base)} />],
      [
        'who',
        <WhoPaysBody
          key="w"
          {...base}
          inputs={{ ...base.inputs, scope: 'household' }}
          memberCount={2}
          memberNames={['A long member name that needs to wrap', 'Second']}
          share={{ weights: [1, 1], myIndex: 0 }}
          dayOneTotal={100_001}
          monthlyTotal={5_001}
        />,
      ],
    ];
    for (const [name, el] of bodies) {
      const view = await wrap(el, 2);
      expect({ name, rendered: screen.toJSON() !== null }).toEqual({ name, rendered: true });
      expect({ name, clamps: clamped().length }).toEqual({ name, clamps: 0 });
      await view.unmount();
    }
  });
});
