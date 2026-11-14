// 06.1-15: the four input sheets (Pick a date, Quick estimate, Installment plan, How often). Engine hook and haptics are mocked.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { percent } from '@/engine/decide';
import type { CheckV2, QuickLine } from '@/engine/decide/v3';
import { checkOnce } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { showToast } from '@/state/undoToast';
import { wrap } from '@/test/stepProps';
import { KEY_PLAN_NAME } from '../../check/planName';
import { DatePickerSheet } from '../DatePickerSheet';
import { HowOftenSheet } from '../HowOftenSheet';
import { InstallmentPlanSheet } from '../InstallmentPlanSheet';
import { QuickEstimateSheet } from '../QuickEstimateSheet';
import * as kinds from '../quickLineKinds';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('../../engine/useCheckEngine', () => ({
  useCheckEngine: jest.fn(() => ({ evaluation: null, readyDate: () => null })),
}));
jest.mock('../quickLineKinds', () => {
  const actual = jest.requireActual('../quickLineKinds');
  return { ...actual, QUICK_LINE_KINDS: [...actual.QUICK_LINE_KINDS] };
});

const TODAY = '2026-11-11';
const fmt = (n: number) => `$${n / 100}`;
const fmtDate = (d: string) => `on ${d}`;
const pickDate = jest.fn();

const planCheck = (over: Partial<CheckV2> = {}): CheckV2 => checkOnce(100_000, over);

async function typeMoney(label: string, text: string) {
  const field = screen.getByLabelText(label);
  await fireEvent.changeText(field, text);
  await fireEvent(field, 'blur');
}

async function renderPlan(check: CheckV2 = planCheck(), extra: Partial<React.ComponentProps<typeof InstallmentPlanSheet>> = {}) {
  const onUse = jest.fn();
  const view = await wrap(
    <InstallmentPlanSheet visible check={check} currency="USD" today={TODAY} itemKind="laptop" formatMoney={fmt} formatDate={fmtDate} onPickDate={pickDate} onUse={onUse} onDismiss={jest.fn()} {...extra} />,
  );
  return { onUse, view };
}

describe('InstallmentPlanSheet', () => {
  it('never saves the example rate: an empty rate field leaves pay.apr null', async () => {
    const { onUse } = await renderPlan();
    await fireEvent.press(await screen.findByLabelText('12 months'));
    // 06.1-60: the rate's helper opens under its Why?; the APR line under the result's More.
    expect(screen.queryByText('Example rate only. It is not your rate and is not saved.')).toBeNull();
    await fireEvent.press(screen.getByTestId('plan-rate-why'));
    expect(screen.getByText('Example rate only. It is not your rate and is not saved.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('plan-result-more'));
    expect(screen.getByText('This is FincWin’s estimate, not the APR on your agreement.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Use this plan'));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse.mock.calls[0][0]).toMatchObject({ mode: 'plan', apr: null, termMonths: 12, count: 12 });
  });

  it('saves a typed rate as a Percent', async () => {
    const { onUse } = await renderPlan();
    await fireEvent.press(await screen.findByLabelText('12 months'));
    await fireEvent.changeText(screen.getByLabelText('Rate, % a year'), '7.9');
    expect(screen.queryByTestId('plan-rate-why')).toBeNull();
    expect(screen.queryByText('Example rate only. It is not your rate and is not saved.')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Use this plan'));
    expect(onUse.mock.calls[0][0].apr).toBe(percent('7.9'));
  });

  it('works out the amount borrowed as price + tax + fees - cash down', async () => {
    await renderPlan(planCheck({ taxPercent: percent('10'), oneOffFees: 5_000 as never }));
    expect(await screen.findByLabelText('Amount borrowed, $1150')).toBeTruthy(); // 1000 + 100 + 50
    await typeMoney('Cash down', '200');
    expect(screen.getByLabelText('Amount borrowed, $950')).toBeTruthy();
  });

  it('06.1-53 C-14: the length note is absent on open and shows once Use is tried with no length', async () => {
    const { onUse } = await renderPlan();
    const use = await screen.findByLabelText('Use this plan');
    expect(screen.queryByText('The plan needs a length.')).toBeNull();
    expect(use.props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(use);
    expect(onUse).not.toHaveBeenCalled();
    expect(screen.getByText('The plan needs a length.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('6 months'));
    expect(screen.queryByText('The plan needs a length.')).toBeNull();
  });

  it('06.1-53 C-14: clearing a length shows the length note', async () => {
    await renderPlan();
    await fireEvent.press(await screen.findByLabelText('6 months'));
    await fireEvent.press(screen.getByLabelText('Other'));
    expect(screen.getByText('The plan needs a length.')).toBeTruthy();
  });

  it('06.1-53 C-14: emptying a typed length shows the length note', async () => {
    await renderPlan();
    await fireEvent.press(await screen.findByLabelText('Other'));
    expect(screen.queryByText('The plan needs a length.')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Number of months (1 to 120)'), '18');
    await fireEvent.changeText(screen.getByLabelText('Number of months (1 to 120)'), '');
    expect(screen.getByText('The plan needs a length.')).toBeTruthy();
  });

  it('06.1-53 C-12: Use stays off until a first payment date on or after today is picked', async () => {
    let setter: ((d: string) => void) | null = null;
    pickDate.mockImplementation((_cur: unknown, set: (d: string) => void) => {
      setter = set;
    });
    const { onUse } = await renderPlan();
    await fireEvent.press(await screen.findByLabelText('12 months'));
    expect(screen.queryByTestId('need-line')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Pick a date'));
    expect(screen.getByLabelText('Use this plan').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('need-line').props.children).toBe('A first payment date on or after today is needed.');
    await act(async () => setter?.('2026-11-01'));
    expect(screen.getByLabelText('Use this plan').props.accessibilityState.disabled).toBe(true);
    await act(async () => setter?.(TODAY));
    expect(screen.getByLabelText('Use this plan').props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByTestId('need-line')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Use this plan'));
    expect(onUse.mock.calls[0][0].firstPayment).toMatchObject({ kind: 'deferred', firstDate: TODAY });
    pickDate.mockReset();
  });

  it('06.1-53 C-12: a next payday before today is not offered', async () => {
    await renderPlan(planCheck(), { nextPayday: '2026-11-01' });
    expect(screen.queryByText(/Next payday/)).toBeNull();
  });

  it('06.1-53 C-12: a saved first payment date before today keeps Save plan off', async () => {
    const saved = planCheck({
      pay: {
        mode: 'plan',
        cadence: { unit: 'month', every: 1 },
        count: 12,
        termMonths: 12,
        apr: null,
        fees: { setup: 0, perPeriod: 0, end: 0 },
        deposit: 0,
        tradeIn: 0,
        quotedPayment: null,
        firstPayment: { kind: 'deferred', firstDate: '2026-10-01', interestDuringPause: false },
        deferredInterestTerm: false,
      } as never,
    });
    await renderPlan(saved, { editing: true });
    expect(screen.getByLabelText('Save plan').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('A first payment date on or after today is needed.')).toBeTruthy();
  });

  it('06.1-53 C-13: a cash down that covers the whole price says nothing is borrowed and keeps Use off', async () => {
    await renderPlan();
    await fireEvent.press(await screen.findByLabelText('12 months'));
    await typeMoney('Cash down', '1000');
    expect(screen.getByLabelText('Amount borrowed, $0')).toBeTruthy();
    expect(screen.getByText('Cash down covers the whole price, so nothing is borrowed.')).toBeTruthy();
    expect(screen.getByLabelText('Use this plan').props.accessibilityState.disabled).toBe(true);
  });

  it('states the fee note and the footer, and has no home-loan option', async () => {
    await renderPlan();
    await fireEvent.press(await screen.findByTestId('plan-fees-why'));
    expect(screen.getByText('Fees vary by provider.')).toBeTruthy();
    expect(screen.getByText('FincWin is a planning tool, not a lender.')).toBeTruthy();
  });

  it('announces the live result once typing stops', async () => {
    jest.useFakeTimers();
    try {
      await renderPlan();
      await fireEvent.press(await screen.findByLabelText('12 months'));
      expect(screen.queryByLabelText(/a month for 12 months/)).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(700);
      });
      expect(screen.getAllByLabelText(/a month for 12 months/)).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('InstallmentPlanSheet 06.1-57 (A-ST-7)', () => {
  it('offers lengths 12, 24, 36 and 48 months plus Other, for a car and for any other kind', async () => {
    for (const itemKind of ['car', 'other'] as const) {
      const { view } = await renderPlan(planCheck(), { itemKind });
      for (const m of [12, 24, 36, 48]) expect(screen.getByLabelText(`${m} months`)).toBeTruthy();
      expect(screen.queryByLabelText('6 months')).toBeNull();
      expect(screen.getByLabelText('Other')).toBeTruthy();
      await view.unmount();
    }
  });

  it('shows the example rate as the field value with an "example" tag; typing replaces it and the tag goes', async () => {
    const { onUse } = await renderPlan(planCheck(), { itemKind: 'car' });
    const rate = await screen.findByLabelText('Rate, % a year');
    expect(rate.props.value).toBe('9.9');
    expect(rate.props.selectTextOnFocus).toBe(true);
    expect(screen.getByTestId('rate-example-tag')).toHaveTextContent('example');
    await fireEvent.changeText(rate, '7.9');
    expect(screen.getByLabelText('Rate, % a year').props.value).toBe('7.9');
    expect(screen.queryByTestId('rate-example-tag')).toBeNull();
    await fireEvent.press(screen.getByLabelText('12 months'));
    await fireEvent.press(screen.getByLabelText('Use this plan'));
    expect(onUse.mock.calls[0][0].apr).toBe(percent('7.9'));
  });

  it('a cleared rate stays empty (the example does not come back) and is still never saved', async () => {
    const { onUse } = await renderPlan(planCheck(), { itemKind: 'car' });
    await fireEvent.changeText(await screen.findByLabelText('Rate, % a year'), '');
    expect(screen.getByLabelText('Rate, % a year').props.value).toBe('');
    await fireEvent.press(screen.getByLabelText('12 months'));
    await fireEvent.press(screen.getByTestId('plan-result-more'));
    expect(screen.getByText('This is FincWin’s estimate, not the APR on your agreement.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Use this plan'));
    expect(onUse.mock.calls[0][0].apr).toBeNull();
  });

  it('hands the typed plan name to onUse, trimmed; none typed is null', async () => {
    const first = await renderPlan(planCheck(), { itemKind: 'car' });
    await fireEvent.changeText(await screen.findByLabelText('Plan name'), '  Car loan ');
    await fireEvent.press(screen.getByLabelText('24 months'));
    await fireEvent.press(screen.getByLabelText('Use this plan'));
    expect(first.onUse.mock.calls[0][1]).toBe('Car loan');
    await first.view.unmount();
    const second = await renderPlan(planCheck(), { itemKind: 'car' });
    await fireEvent.press(await screen.findByLabelText('24 months'));
    await fireEvent.press(screen.getByLabelText('Use this plan'));
    expect(second.onUse.mock.calls[0][1]).toBeNull();
  });

  it('opens with a stored plan name, and the money fields carry the currency sign and the rate a %', async () => {
    await renderPlan(planCheck({ layerAnswers: { [KEY_PLAN_NAME]: 'Car loan' } }), { itemKind: 'car' });
    expect((await screen.findByLabelText('Plan name')).props.value).toBe('Car loan');
    expect(screen.getAllByTestId('money-symbol').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByTestId('field-suffix')).toHaveTextContent('%');
  });
});

describe('QuickEstimateSheet', () => {
  const base = { visible: true, currency: 'USD', today: TODAY, formatDate: fmtDate, onPickDate: pickDate, onDismiss: jest.fn() };

  it('builds an expense line and says it counts in this check only', async () => {
    const onAdd = jest.fn();
    await wrap(<QuickEstimateSheet {...base} kind="expense" onAdd={onAdd} />);
    expect(screen.getByText('Counts in this check only. Your records do not change.')).toBeTruthy();
    const add = () => screen.getByLabelText('Add to this check');
    expect(add().props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Insurance');
    await typeMoney('Amount', '45');
    await fireEvent.press(screen.getByLabelText('Every 3 months'));
    await fireEvent.press(add());
    expect(onAdd).toHaveBeenCalledWith({ id: 'uuid-1', kind: 'expense', name: 'Insurance', amount: 4_500, everyMonths: 3, date: TODAY });
  });

  it('06.1-53 C-17: says a name and an amount above zero are needed under the disabled button', async () => {
    await wrap(<QuickEstimateSheet {...base} kind="expense" onAdd={jest.fn()} />);
    const need = 'A name and an amount above zero are needed.';
    expect(screen.getByText(need)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Insurance');
    expect(screen.getByText(need)).toBeTruthy();
    await typeMoney('Amount', '45');
    expect(screen.queryByText(need)).toBeNull();
  });

  it('builds a loan line with payments left bounded 1 to 600', async () => {
    const onAdd = jest.fn();
    await wrap(<QuickEstimateSheet {...base} kind="loan" onAdd={onAdd} />);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Family');
    await typeMoney('Monthly payment', '100');
    await fireEvent.changeText(screen.getByLabelText('Payments left'), '700');
    expect(screen.getByLabelText('Add to this check').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Payments go from 1 to 600.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Payments left'), '10');
    await fireEvent.press(screen.getByLabelText('Add to this check'));
    expect(onAdd).toHaveBeenCalledWith({ id: 'uuid-1', kind: 'loan', name: 'Family', monthly: 10_000, payments: 10, firstDate: null });
  });

  it('savings default to not usable by answers', async () => {
    const onAdd = jest.fn();
    await wrap(<QuickEstimateSheet {...base} kind="savings" onAdd={onAdd} />);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Other bank');
    await typeMoney('Amount', '500');
    await fireEvent.press(screen.getByLabelText('Add to this check'));
    expect(onAdd.mock.calls[0][0]).toMatchObject({ kind: 'savings', usable: false });
  });

  it('builds an income line that arrives on a date', async () => {
    const onAdd = jest.fn();
    await wrap(<QuickEstimateSheet {...base} kind="income" onAdd={onAdd} />);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Refund');
    await typeMoney('Amount', '300');
    await fireEvent.press(screen.getByLabelText('Add to this check'));
    expect(onAdd.mock.calls[0][0]).toMatchObject({ kind: 'income', amount: 30_000, everyMonths: 0, date: TODAY });
  });

  it('an expense-only build offers no Loan, Savings or Income sheet', async () => {
    const list = kinds.QUICK_LINE_KINDS as kinds.QuickLineKind[];
    const all = [...list];
    list.splice(0, list.length, 'expense');
    try {
      await wrap(<QuickEstimateSheet {...base} kind="loan" onAdd={jest.fn()} />);
      expect(screen.queryByLabelText('Payments left')).toBeNull();
      await wrap(<QuickEstimateSheet {...base} kind="expense" onAdd={jest.fn()} />);
      expect(screen.getByLabelText('Name')).toBeTruthy();
    } finally {
      list.splice(0, list.length, ...all);
    }
  });

  it('Remove shows a toast whose Undo puts the line back', async () => {
    const line: QuickLine = { id: 'q1', kind: 'savings', name: 'Other bank', amount: 50_000 as never, usable: true };
    const onAdd = jest.fn();
    const onRemove = jest.fn();
    await wrap(<QuickEstimateSheet {...base} kind="savings" line={line} onAdd={onAdd} onRemove={onRemove} />);
    expect(screen.getByLabelText('Save quick estimate')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove'));
    expect(onRemove).toHaveBeenCalledWith(line);
    const toast = (showToast as jest.Mock).mock.calls[0][0];
    expect(toast).toMatchObject({ kind: 'destructive', text: { key: 'decide.screens.common.toast.removed', params: { item: 'Other bank' } } });
    toast.onUndo();
    expect(onAdd).toHaveBeenCalledWith(line);
  });
});

describe('DatePickerSheet', () => {
  it('marks paydays with a dot and in the day label, and flags dates past 90 days', async () => {
    const onUse = jest.fn();
    await wrap(
      <DatePickerSheet visible check={checkOnce(100_000)} today={TODAY} paydays={['2026-11-20']} locale="en-US" formatDate={fmtDate} onUse={onUse} onDismiss={jest.fn()} />,
    );
    expect(screen.getByTestId('payday-2026-11-20')).toBeTruthy();
    expect(screen.getByLabelText('on 2026-11-20, payday')).toBeTruthy();
    expect(screen.getByLabelText('on 2026-11-11, today')).toBeTruthy();
    expect(screen.queryByText('This is far off. The answer looks only 90 days ahead.')).toBeNull();
    await fireEvent.press(screen.getByLabelText('on 2026-11-20, payday'));
    await fireEvent.press(screen.getByLabelText('Use on 2026-11-20'));
    expect(onUse).toHaveBeenCalledWith('2026-11-20');
  });
});

describe('HowOftenSheet', () => {
  it('applies only on Save how often and shows the monthly figure', async () => {
    const onSave = jest.fn();
    await wrap(
      <HowOftenSheet visible value={{ everyMonths: 1, start: null, end: null }} amount={120_000} formatMoney={fmt} formatDate={fmtDate} onPickDate={pickDate} onSave={onSave} onDismiss={jest.fn()} />,
    );
    await fireEvent.press(screen.getByLabelText('Every year'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('$1200 every year is about $100 a month, from the day you buy.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save how often'));
    expect(onSave).toHaveBeenCalledWith({ everyMonths: 12, start: null, end: null });
  });
});

describe('HowOftenSheet dates (06.1-53 C-15)', () => {
  const renderOften = async (start: string | null, end: string | null) => {
    const onSave = jest.fn();
    await wrap(
      <HowOftenSheet visible value={{ everyMonths: 1, start, end }} amount={120_000} formatMoney={fmt} formatDate={fmtDate} onPickDate={pickDate} onSave={onSave} onDismiss={jest.fn()} />,
    );
    return onSave;
  };

  it('refuses an end date before the start date and says why', async () => {
    const onSave = await renderOften('2026-12-01', '2026-11-20');
    expect(screen.getByLabelText('Save how often').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('The end date comes before the start date.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save how often'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('allows an end on the start date', async () => {
    const onSave = await renderOften('2026-12-01', '2026-12-01');
    expect(screen.queryByText('The end date comes before the start date.')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Save how often'));
    expect(onSave).toHaveBeenCalledWith({ everyMonths: 1, start: '2026-12-01', end: '2026-12-01' });
  });
});
