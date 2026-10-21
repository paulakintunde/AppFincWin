import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { withPrice, type BuyCheck } from '@/engine/decide';
import { showToast } from '@/state/undoToast';
import { SetbacksSection } from '../SetbacksSection';
import { OptionsSection } from '../OptionsSection';
import type { SectionProps } from '../sectionUi';
import { buy, exact, stepProps, whole, wrap } from '../../steps/__tests__/helpers/stepProps';
import { loggedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import { computeCheck } from '../../../snapshot/computeCheck';
import type { CheckInputs } from '../../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));

function sectionProps(over: Partial<CheckInputs>, extra: Partial<SectionProps> = {}): SectionProps {
  const p = stepProps(buy(over), {}, loggedSource());
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
const tax = { id: 't', name: '', amount: 0, note: '', counted: true, effect: 'adds' as const, onDay: true, taxPercentText: '10' };
const CASH_NO: Partial<CheckInputs> = { advertised: 3_000_000, method: 'cash' };
const LOAN_NO: Partial<CheckInputs> = {
  advertised: 3_000_000,
  method: 'loan',
  loan: { deposit: 0, termMonths: 12, aprText: '10', secured: false, securedTouched: true, aprFromQuick: false, promo: null, variable: false },
};
const INSTALMENT_TAX: Partial<CheckInputs> = {
  advertised: 1_500_000,
  method: 'instalment',
  adjustments: [tax],
  instalment: { amount: 130_000, count: 12, lateFee: 0 },
};
const optionProps = (over: Partial<CheckInputs>, extra: Partial<SectionProps> = {}) => ({
  ...sectionProps(over, extra),
  onOpenActivity: jest.fn(),
  onSwitchToWait: jest.fn(),
  lineName: (id: string) => `Line ${id}`,
});

describe('SetbacksSection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists the four defaults, each unchecked, with a hit and cash after, and the runway in the summary', async () => {
    const p = sectionProps(CASH_NO);
    await wrap(<SetbacksSection {...p} />);
    expect(screen.getByText('If something goes wrong')).toBeTruthy();
    expect(screen.getByText('Runway 0 months, 3 less because of this')).toBeTruthy();
    for (const name of ['Unexpected expense', 'Income drops', 'Job or client loss', 'Invoices pay late']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.getByText('One month’s costs, once')).toBeTruthy();
    expect(screen.getByText('Paid 30 days late')).toBeTruthy();
    expect(screen.getAllByText('wiped out').length).toBe(4);
    expect(screen.queryByText(/Cash left:/)).toBeNull();
    expect(p.computation.setbacks?.runwayMonths).toBe(0);
  });

  it('reads Runway not limited when there is no burn to run out of', async () => {
    const p = sectionProps(CASH_NO);
    const setbacks = { ...(p.computation.setbacks as NonNullable<typeof p.computation.setbacks>), runwayMonths: null };
    await wrap(<SetbacksSection {...p} computation={{ ...p.computation, setbacks }} />);
    expect(screen.getByText('Runway not limited')).toBeTruthy();
  });

  it('toggling a setback updates inputs.setbacks and the outcome tile shows once one is on', async () => {
    const p = sectionProps(LOAN_NO);
    await wrap(<SetbacksSection {...p} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Income drops/ }));
    const next = (p.update as jest.Mock).mock.calls[0][0].setbacks as CheckInputs['setbacks'];
    expect(next.map((s) => s.enabled)).toEqual([false, true, false, false]);

    const on = sectionProps({ ...LOAN_NO, setbacks: next });
    await wrap(<SetbacksSection {...on} />);
    expect(on.computation.setbacks?.anyEnabled).toBe(true);
    expect(screen.getByText(/The cushion absorbs it\. Cash left:/)).toBeTruthy();
  });

  it('removes a setback with a local undo toast and opens the editor for a new one', async () => {
    const p = sectionProps(CASH_NO);
    await wrap(<SetbacksSection {...p} />);
    await fireEvent.press(screen.getByLabelText('Remove Income drops'));
    expect(((p.update as jest.Mock).mock.calls[0][0].setbacks as unknown[]).length).toBe(3);
    expect((showToast as jest.Mock).mock.calls[0][0].text.key).toBe('decide.toast.lineRemoved');
    await fireEvent.press(screen.getByText('+ Add a setback to test'));
    expect(screen.getByText('Add a setback to test')).toBeTruthy();
  });

  it('WR-C07: before the figures settle, each live line keeps its own result after another is removed', async () => {
    const p = sectionProps(CASH_NO);
    const ids = p.inputs.setbacks.map((s) => s.id);
    const label = (re: RegExp) => screen.getByRole('checkbox', { name: re }).props.accessibilityLabel as string;
    const full = await wrap(<SetbacksSection {...p} />);
    const invoices = label(/^Invoices pay late/);
    const job = label(/^Job or client loss/);
    expect(invoices).not.toBe(job);
    await full.unmount();
    const live = { ...p.inputs, setbacks: p.inputs.setbacks.filter((s) => s.code !== 'income_drop') };
    await wrap(<SetbacksSection {...p} inputs={live} resultIds={ids} />);
    expect(label(/^Invoices pay late/)).toBe(invoices);
    expect(label(/^Job or client loss/)).toBe(job);
  });

  it('has no lock chrome and no literal close mark', async () => {
    await wrap(<SetbacksSection {...sectionProps(CASH_NO)} />);
    expect(screen.queryByText(/Pro|locked|Upgrade/i)).toBeNull();
    expect(screen.queryByText('×')).toBeNull();
    expect(screen.queryByText('x')).toBeNull();
  });

  it('renders nothing without a computed report', async () => {
    const p = sectionProps(CASH_NO);
    await wrap(<SetbacksSection {...p} computation={{ ...p.computation, setbacks: null }} />);
    expect(screen.queryByText('If something goes wrong')).toBeNull();
  });
});

describe('OptionsSection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is omitted when the verdict fits', async () => {
    await wrap(<OptionsSection {...optionProps({ advertised: 150_000, method: 'cash' })} />);
    expect(screen.queryByText('What would make it work')).toBeNull();
  });

  it('lists options as noun phrases and none starts with an imperative verb', async () => {
    const p = optionProps(LOAN_NO);
    await wrap(<OptionsSection {...p} />);
    expect(screen.getByText('What would make it work')).toBeTruthy();
    expect(screen.getByText('In order of how much they move. The first two change the purchase; the rest change your month.')).toBeTruthy();
    const names = p.computation.options.map((o) => {
      switch (o.code) {
        case 'affordable_price': return /^At \$/;
        case 'longer_term': return /^A \d+-month term$/;
        case 'earn_more': return /more a month coming in$/;
        case 'do_without': return /^Without it$/;
        default: return /./;
      }
    });
    expect(names.length).toBeGreaterThan(2);
    for (const re of names) expect(screen.getByText(re)).toBeTruthy();
    // the only text starting with an imperative verb is an action pill, never an option name
    const imperative = screen.queryAllByText(/^(Use|Cut|Earn|Pay|Buy|Save )(?!first, then buy)/);
    for (const m of imperative) expect(m.parent?.props.accessibilityRole).toBe('button');
    expect(screen.getByText(/That is 16\.75% more than your average month brings in\./)).toBeTruthy();
  });

  it('Use this term sets the loan term the engine proposed', async () => {
    const p = optionProps(LOAN_NO);
    await wrap(<OptionsSection {...p} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Use this term' }));
    const term = p.computation.options.find((o) => o.code === 'longer_term');
    expect((p.update as jest.Mock).mock.calls[0][0].loan.termMonths).toBe((term as { termMonths: number }).termMonths);
  });

  it('Use this price re-prices the check through repriceInputs', async () => {
    const p = optionProps(CASH_NO);
    await wrap(<OptionsSection {...p} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Use this price' }));
    const patch = (p.update as jest.Mock).mock.calls[0][0] as Partial<CheckInputs>;
    const option = p.computation.options.find((o) => o.code === 'affordable_price') as { price: number };
    expect(patch.advertised).toBe(option.price);
  });

  it('use this price on an instalment plan rescales the instalments', async () => {
    const p = optionProps(INSTALMENT_TAX);
    expect(p.computation.options.some((o) => o.code === 'affordable_price')).toBe(true);
    await wrap(<OptionsSection {...p} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Use this price' }));
    const patch = (p.update as jest.Mock).mock.calls[0][0] as Partial<CheckInputs>;
    const next = { ...p.inputs, ...patch };
    const scored = computeCheck(loggedSource(), next);
    expect(scored.verdict).not.toBeNull();
    expect(scored.verdict?.state).not.toBe('missing');
    const rescaled = withPrice(scored.check as BuyCheck, scored.resolvedPrice!.price) as BuyCheck;
    // the stored instalment is the engine's own scaling for the price it reached, and it dropped with the price
    expect(patch.instalment?.amount).toBe((rescaled.payment as { instalmentAmount: number }).instalmentAmount);
    expect(patch.instalment!.amount!).toBeLessThan(130_000);
    expect(patch.advertised!).toBeLessThan(1_500_000);
  });

  it('Switch to wait and Open in Activity call their handlers; Without it has no pill', async () => {
    const p = optionProps(CASH_NO);
    await wrap(<OptionsSection {...p} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Switch to wait' }));
    expect(p.onSwitchToWait).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Without it')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^(Use|Open|Switch)/ }).length).toBe(2); // price + wait
  });

  it('hides the pills on a decided (read-only) check', async () => {
    await wrap(<OptionsSection {...optionProps(LOAN_NO, { readOnly: true })} />);
    expect(screen.queryByRole('button', { name: 'Use this term' })).toBeNull();
  });
});
