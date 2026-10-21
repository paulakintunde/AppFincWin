// 05-44: running-cost prompts (D-33), the loss-of-value entry (D-44) and the estimate-gap notes (D-36) on step 2.
import React, { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { EstimateBias } from '@/engine/decide';
import { Step2PriceAndPay, type Step2Props } from '../Step2PriceAndPay';
import { EstimateGapNote } from '../step2/EstimateGapNote';
import { computeCheck } from '../../../snapshot/computeCheck';
import type { CheckInputs } from '../../../snapshot/types';
import { loggedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import { buy, stepProps, wrap } from './helpers/stepProps';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
const mockBias = { running: null as EstimateBias | null, payment: null as EstimateBias | null, dayOne: null as EstimateBias | null };
jest.mock('../../useEstimateBias', () => ({ useEstimateBias: () => mockBias }));

const source = loggedSource();

function Harness({ initial, readOnly = false, onUpdate }: { initial: CheckInputs; readOnly?: boolean; onUpdate?: (p: Partial<CheckInputs>) => void }) {
  const [inputs, setInputs] = useState(initial);
  const update = (patch: Partial<CheckInputs>) => {
    onUpdate?.(patch);
    setInputs((cur) => ({ ...cur, ...patch }));
  };
  const props: Step2Props = { ...stepProps(inputs, { update, readOnly }, source), computation: computeCheck(source, inputs), onSaveCardRate: jest.fn(), onSaveCardTerms: jest.fn() };
  return <Step2PriceAndPay {...props} />;
}

async function type(label: string, text: string) {
  const field = screen.getByLabelText(label);
  await fireEvent.changeText(field, text);
  await fireEvent(field, 'blur');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBias.running = null;
  mockBias.payment = null;
  mockBias.dayOne = null;
});

describe('Step 2 running-cost prompts', () => {
  it('pre-lists a vehicle\'s categories as unchecked rows with blank amounts', async () => {
    await wrap(<Harness initial={buy({ itemType: 'vehicle' })} />);
    for (const name of ['Insurance', 'Fuel', 'Maintenance', 'Registration']) {
      const row = screen.getByLabelText(`${name}, Type an amount to count it`);
      expect(row.props.accessibilityState).toMatchObject({ checked: false });
    }
    expect(screen.getAllByPlaceholderText('Add amount').length).toBeGreaterThanOrEqual(5); // four rows and the loss-of-value field
    expect(screen.getByText('Loss of value')).toBeTruthy();
    expect(screen.queryByLabelText(/^Loss of value,.*(Type an amount|checkbox)/)).toBeNull();
    expect(screen.getByText('Not a monthly cash cost')).toBeTruthy();
  });

  it('lists insurance and maintenance for a general item and nothing for a bill', async () => {
    const view = await wrap(<Harness initial={buy({ itemType: 'general' })} />);
    expect(screen.getByLabelText('Insurance, Type an amount to count it')).toBeTruthy();
    expect(screen.getByLabelText('Maintenance, Type an amount to count it')).toBeTruthy();
    expect(screen.queryByLabelText('Fuel, Type an amount to count it')).toBeNull();
    await view.unmount();
    await wrap(<Harness initial={buy({ itemType: 'rent_bill' })} />);
    expect(screen.queryByLabelText('Insurance, Type an amount to count it')).toBeNull();
    expect(screen.queryByText('Loss of value')).toBeNull();
  });

  it('counts a row only once an amount is typed, and clearing it marks the line not counted', async () => {
    const updates: Partial<CheckInputs>[] = [];
    await wrap(<Harness initial={buy({ itemType: 'vehicle' })} onUpdate={(p) => updates.push(p)} />);
    await type('Insurance, amount a month', '120');
    expect(updates.at(-1)?.runningCosts).toEqual([
      { id: 'prompt-insurance', name: '', amount: 12_000, note: '', counted: true, seriesId: null, category: 'insurance' },
    ]);
    expect(screen.getByLabelText('Insurance, $120.00').props.accessibilityState).toMatchObject({ checked: true });
    await type('Insurance, amount a month', '');
    expect(updates.at(-1)?.runningCosts).toEqual([
      { id: 'prompt-insurance', name: '', amount: 0, note: '', counted: false, seriesId: null, category: 'insurance' },
    ]);
    expect(screen.getByLabelText('Insurance, Type an amount to count it').props.accessibilityState).toMatchObject({ checked: false });
  });

  it('does not list a category twice when a line for it already exists', async () => {
    const line = { id: 'x1', name: '', amount: 5_000, note: '', counted: true, seriesId: null, category: 'fuel' as const };
    await wrap(<Harness initial={buy({ itemType: 'vehicle', runningCosts: [line] })} />);
    expect(screen.getAllByLabelText(/^Fuel/)).toHaveLength(2); // the row's checkbox and its amount field, nothing more
    expect(screen.getByLabelText('Fuel, $50.00')).toBeTruthy();
  });

  it('a decided check cannot edit an amount', async () => {
    await wrap(<Harness initial={buy({ itemType: 'vehicle' })} readOnly />);
    expect(screen.getByLabelText('Insurance, amount a month').props.editable).toBe(false);
    expect(screen.getByLabelText('Loss of value, amount a month').props.editable).toBe(false);
  });

  it('loss of value takes an amount or a percent a year and stays out of the month', async () => {
    const updates: Partial<CheckInputs>[] = [];
    const base = buy({ itemType: 'vehicle', advertised: 1_450_000 });
    await wrap(<Harness initial={base} onUpdate={(p) => updates.push(p)} />);

    await type('Loss of value, amount a month', '250');
    expect(updates.at(-1)).toEqual({ lossOfValue: { kind: 'amount', monthly: 25_000 } });
    expect(screen.getByText('About $250 a month. Shown here, not counted in your month.')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('% a year'));
    expect(updates.at(-1)).toEqual({ lossOfValue: null });
    expect(screen.queryByText(/^About .* a month/)).toBeNull();

    await type('Loss of value, percent a year', '15');
    expect(updates.at(-1)).toEqual({ lossOfValue: { kind: 'percent_per_year', percentText: '15' } });
    expect(screen.getByText('About $181 a month. Shown here, not counted in your month.')).toBeTruthy();

    const without = computeCheck(source, base).running;
    const withLoss = computeCheck(source, { ...base, lossOfValue: { kind: 'percent_per_year', percentText: '15' } }).running;
    expect(withLoss?.nonCash).toBe(18_125);
    expect(withLoss?.net).toBe(without?.net);
    expect(updates.some((u) => (u.runningCosts ?? []).some((l) => l.category === ('loss_of_value' as unknown)))).toBe(false);

    await fireEvent.changeText(screen.getByLabelText('Loss of value, percent a year'), '150'); // above 100: sends nothing
    const calls = updates.length;
    await fireEvent.changeText(screen.getByLabelText('Loss of value, percent a year'), '15.');
    expect(updates).toHaveLength(calls);

    await fireEvent.changeText(screen.getByLabelText('Loss of value, percent a year'), '');
    expect(updates.at(-1)).toEqual({ lossOfValue: null });
  });

  it('WR-C13: editing 5.5 down to 5. stores 5, and a stored percent changed from outside replaces the text', async () => {
    const update = jest.fn();
    const at = (percentText: string): Step2Props => {
      const inputs = buy({ itemType: 'vehicle', advertised: 1_450_000, lossOfValue: { kind: 'percent_per_year', percentText } });
      return { ...stepProps(inputs, { update }, source), computation: computeCheck(source, inputs), onSaveCardRate: jest.fn(), onSaveCardTerms: jest.fn() };
    };
    const view = await wrap(<Step2PriceAndPay {...at('5.5')} />);
    const field = () => screen.getByLabelText('Loss of value, percent a year');
    expect(field().props.value).toBe('5.5');
    await fireEvent.changeText(field(), '5.');
    expect(update).toHaveBeenLastCalledWith({ lossOfValue: { kind: 'percent_per_year', percentText: '5' } });
    await view.rerender(<Step2PriceAndPay {...at('5')} />);
    expect(field().props.value).toBe('5.');
    await view.rerender(<Step2PriceAndPay {...at('9')} />);
    expect(field().props.value).toBe('9');
  });
});

describe('Step 2 estimate gap notes', () => {
  const bias = (figure: EstimateBias['figure'], biasBasisPoints: number | null): EstimateBias => ({ figure, decisionsUsed: 3, biasBasisPoints });

  it('states nothing without a figure', async () => {
    await wrap(<Harness initial={buy({ itemType: 'vehicle' })} />);
    expect(screen.queryByText(/than estimated/)).toBeNull();
  });

  it('states the running-cost, payment and day-one gaps in neutral words', async () => {
    mockBias.running = bias('running_costs', 2_000);
    mockBias.payment = bias('monthly_payment', -1_500);
    mockBias.dayOne = bias('day_one', 800);
    await wrap(<Harness initial={buy({ itemType: 'vehicle' })} />);
    expect(screen.getByText('Your running costs have come in about 20% higher than estimated.')).toBeTruthy();
    expect(screen.getByText('Your payments have come in about 15% lower than estimated.')).toBeTruthy();
    expect(screen.getByText('Your day-one costs have come in about 8% higher than estimated.')).toBeTruthy();
    expect(screen.queryByText(/should|advice|recommend/i)).toBeNull();
  });

  it('EstimateGapNote renders nothing for null, a zero gap or a missing figure', async () => {
    const view = await wrap(<EstimateGapNote bias={null} />);
    expect(screen.queryByText(/than estimated/)).toBeNull();
    await view.rerender(<EstimateGapNote bias={bias('running_costs', 20)} />);
    expect(screen.queryByText(/than estimated/)).toBeNull();
    await view.rerender(<EstimateGapNote bias={bias('running_costs', null)} />);
    expect(screen.queryByText(/than estimated/)).toBeNull();
  });
});
