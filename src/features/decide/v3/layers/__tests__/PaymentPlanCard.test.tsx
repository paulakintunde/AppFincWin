/** Plan 05.3-40: the payment plan card: cadence, length, rate (never defaulted), down payment in pay.deposit, summary, whole-plan link. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { CheckV2, Evaluation } from '@/engine/decide/v3';
import { percent } from '@/engine/payoff';
import { emptyCheck, withItemType, withPayMode, withPrice } from '../../model/checkEdits';
import { PaymentPlanCard } from '../PaymentPlanCard';
import { Stateful } from './harness';

jest.setTimeout(60000);

const mockPush = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (href: unknown) => mockPush(href) }));
jest.mock('../../nav/hrefs', () => ({ planHref: (id: string) => `/decide/plan/${id}` }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: false, ready: true, today: '2026-10-31' }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('../../shared/useV3Format', () => ({
  useV3Format: () => ({ date: (iso: string) => iso, money: (minor: number) => `$${Math.round(minor / 100).toLocaleString('en-US')}` }),
}));

const ID = 'chk-1';
const EVAL = {
  purchase: { schedule: { count: 60, payment: 52000, cadence: { unit: 'month', every: 1 }, monthlyEquivalent: 52000 } },
  planCard: { total: 3300000 },
} as unknown as Evaluation;

function planCheck(itemType: 'vehicle' | 'property' | 'general' = 'vehicle'): CheckV2 {
  return withPayMode(withItemType(withPrice(emptyCheck(), 2700000 as never), { kind: 'preset', value: itemType }), 'plan');
}

function mount(initial: CheckV2, evaluation: Evaluation | null = EVAL, onCheck?: (c: CheckV2) => void) {
  return render(
    <Stateful initial={initial} onCheck={onCheck}>
      {({ check, edit }) => <PaymentPlanCard check={check} evaluation={evaluation} edit={edit} checkId={ID} currency="USD" />}
    </Stateful>,
  );
}

function plan(c: CheckV2) {
  if (c.pay.mode !== 'plan') throw new Error('not a plan');
  return c.pay;
}

describe('PaymentPlanCard', () => {
  beforeEach(() => mockPush.mockClear());

  it('renders nothing when the check is paid at once', async () => {
    await render(<Stateful initial={emptyCheck()}>{({ check, edit }) => <PaymentPlanCard check={check} evaluation={null} edit={edit} checkId={ID} currency="USD" />}</Stateful>);
    expect(screen.queryByTestId('payment-plan-card')).toBeNull();
  });

  it('offers Weekly, Every 2 weeks and Monthly (never twice a month) and sets the cadence', async () => {
    let latest = planCheck();
    await mount(latest, EVAL, (c) => { latest = c; });
    expect(screen.queryByLabelText(/twice/i)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Every 2 weeks'));
    expect(plan(latest).cadence).toEqual({ unit: 'week', every: 2 });
    await fireEvent.press(screen.getByLabelText('Weekly'));
    expect(plan(latest).cadence).toEqual({ unit: 'week', every: 1 });
  });

  it('length chips set termMonths and the payments count is shown', async () => {
    let latest = planCheck();
    await mount(latest, EVAL, (c) => { latest = c; });
    expect(screen.getByText('A loan length is needed.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('60 months'));
    expect(plan(latest).termMonths).toBe(60);
    expect(plan(latest).count).toBeNull();
    expect(screen.queryByText('A loan length is needed.')).toBeNull();
    expect(screen.getByText('60 payments')).toBeTruthy();
  });

  it('never defaults the rate: empty stays null, typed 0 is 0%, over 100% is refused', async () => {
    let latest = planCheck();
    await mount(latest, EVAL, (c) => { latest = c; });
    expect(plan(latest).apr).toBeNull();
    const field = screen.getByLabelText('Interest rate or APR');
    await fireEvent.changeText(field, '0');
    expect(plan(latest).apr).toBe(percent('0'));
    await fireEvent.changeText(field, '6.9');
    expect(plan(latest).apr).toBe(percent('6.9'));
    await fireEvent.changeText(field, '15');
    const valid = plan(latest).apr;
    await fireEvent.changeText(field, '150');
    expect(plan(latest).apr).toBe(valid);
    expect(screen.getByText('A rate over 100% a year isn’t accepted.')).toBeTruthy();
    await fireEvent.changeText(field, '');
    expect(plan(latest).apr).toBeNull();
  });

  it('M-08: the down payment goes to pay.deposit and never to extras', async () => {
    let latest = planCheck();
    await mount(latest, EVAL, (c) => { latest = c; });
    await fireEvent.changeText(screen.getByLabelText('Down payment'), '5000');
    expect(plan(latest).deposit).toBe(500000);
    expect(Object.keys(latest.extras)).toEqual([]);
  });

  it('writes set-up fees, more fees and a quoted payment', async () => {
    let latest = planCheck();
    await mount(latest, EVAL, (c) => { latest = c; });
    await fireEvent.changeText(screen.getByLabelText('Set-up and other fees'), '200');
    expect(plan(latest).fees.setup).toBe(20000);
    await fireEvent.press(screen.getByLabelText('More fees'));
    await fireEvent.changeText(screen.getByLabelText('Fee with each payment'), '5');
    await fireEvent.changeText(screen.getByLabelText('Fee at the end'), '50');
    expect(plan(latest).fees).toEqual({ setup: 20000, perPeriod: 500, end: 5000 });
    await fireEvent.press(screen.getByLabelText('I have a quoted payment'));
    await fireEvent.changeText(screen.getByLabelText('Quoted payment'), '510');
    expect(plan(latest).quotedPayment).toBe(51000);
  });

  it('shows the live summary tile and opens the whole plan from the link', async () => {
    await mount(planCheck());
    expect(screen.getByText('60 payments every month')).toBeTruthy();
    expect(screen.getByText('$520')).toBeTruthy();
    expect(screen.getByText('about')).toBeTruthy();
    expect(screen.getByText('$520/mo')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('See the whole plan: $33,000 in total'));
    expect(mockPush).toHaveBeenCalledWith('/decide/plan/chk-1');
  });

  it('has no summary or link while the engine has no schedule', async () => {
    await mount(planCheck(), null);
    expect(screen.queryByTestId('plan-summary')).toBeNull();
    expect(screen.queryByText(/See the whole plan/)).toBeNull();
  });

  it('shows the card note by item type', async () => {
    await mount(planCheck('vehicle'));
    expect(screen.getByText('Most dealers cap card payments for a car.')).toBeTruthy();
  });

  it('property and general notes', async () => {
    await mount(planCheck('property'));
    expect(screen.getByText('A property deposit can’t go on a card.')).toBeTruthy();
  });

  it('general shows the no-limit note', async () => {
    await mount(planCheck('general'));
    expect(screen.getByText('No card limit applies to this kind of purchase.')).toBeTruthy();
  });
});

// 05.3-52 (F8): an empty or zero fee shows the muted zero hint, never a pre-filled 0.00 value.
describe('PaymentPlanCard fee hints', () => {
  it('Set-up and other fees and Down payment are empty with a 0.00 hint', async () => {
    await mount(planCheck());
    for (const label of ['Set-up and other fees', 'Down payment']) {
      const field = screen.getByLabelText(label);
      expect(field.props.value).toBe('');
      expect(field.props.placeholder).toBe('0.00');
      expect(field.props.accessibilityLabel).toBe(label);
      expect(field.props.accessibilityValue).toBeUndefined();
    }
  });

  it('a fee typed back to 0 returns to the hint', async () => {
    await mount(planCheck());
    await fireEvent.changeText(screen.getByLabelText('Set-up and other fees'), '25');
    await fireEvent(screen.getByLabelText('Set-up and other fees'), 'blur');
    expect(screen.getByLabelText('Set-up and other fees').props.value).toBe('25');
    await fireEvent.changeText(screen.getByLabelText('Set-up and other fees'), '');
    await fireEvent(screen.getByLabelText('Set-up and other fees'), 'blur');
    const field = screen.getByLabelText('Set-up and other fees');
    expect(field.props.value).toBe('');
    expect(field.props.placeholder).toBe('0.00');
  });

  it('More fees fields hint 0.00 too', async () => {
    await mount(planCheck());
    await fireEvent.press(screen.getByText('More fees'));
    expect(screen.getByLabelText('Fee with each payment').props.placeholder).toBe('0.00');
    expect(screen.getByLabelText('Fee at the end').props.placeholder).toBe('0.00');
  });
  describe('first payment (05.3-71)', () => {
    it('asks for the first payment with nothing chosen and shows the missing line', async () => {
      await mount(planCheck(), null);
      expect(screen.getByText('First payment')).toBeTruthy();
      expect(screen.getByText('The first payment date isn’t chosen yet.')).toBeTruthy();
      expect(screen.getByText('The plan’s rate isn’t entered yet.')).toBeTruthy();
      expect(screen.getByLabelText('Today').props.accessibilityState?.selected).toBeFalsy();
    });

    it('Today and In a month write firstPayment', async () => {
      let latest = planCheck();
      await mount(latest, null, (c) => { latest = c; });
      await fireEvent.press(screen.getByLabelText('Today'));
      expect(plan(latest).firstPayment).toEqual({ kind: 'today' });
      expect(screen.queryByText('The first payment date isn’t chosen yet.')).toBeNull();
      await fireEvent.press(screen.getByLabelText('In a month'));
      expect(plan(latest).firstPayment).toEqual({ kind: 'one_period' });
    });

    it('labels the next-payment chip by how often', async () => {
      await mount(planCheck(), null);
      await fireEvent.press(screen.getByLabelText('Weekly'));
      expect(screen.getByLabelText('In a week')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Every 2 weeks'));
      expect(screen.getByLabelText('In 2 weeks')).toBeTruthy();
    });

    it('On a later date sets a default date, shows the date field and asks about interest', async () => {
      let latest = planCheck();
      await mount(latest, null, (c) => { latest = c; });
      await fireEvent.press(screen.getByLabelText('On a later date'));
      expect(plan(latest).firstPayment).toEqual({ kind: 'deferred', firstDate: '2026-11-30', interestDuringPause: null });
      expect(screen.getByText('First payment date')).toBeTruthy();
      expect(screen.getByText('Does interest build until then?')).toBeTruthy();
      expect(screen.getByText('Whether interest builds during a pause isn’t answered yet.')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Yes'));
      expect(plan(latest).firstPayment).toEqual({ kind: 'deferred', firstDate: '2026-11-30', interestDuringPause: true });
      expect(screen.queryByText('Whether interest builds during a pause isn’t answered yet.')).toBeNull();
    });

    it('typing a rate removes the rate line, and a complete plan shows the estimate tile', async () => {
      let latest = planCheck();
      await mount(latest, EVAL, (c) => { latest = c; });
      await fireEvent.changeText(screen.getByLabelText('Interest rate or APR'), '6');
      expect(screen.queryByText('The plan’s rate isn’t entered yet.')).toBeNull();
      expect(screen.getByTestId('plan-summary')).toBeTruthy();
    });
  });
});
