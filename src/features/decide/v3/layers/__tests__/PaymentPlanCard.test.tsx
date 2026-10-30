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
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: false, ready: true }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('../../shared/useV3Format', () => ({
  useV3Format: () => ({ money: (minor: number) => `$${Math.round(minor / 100).toLocaleString('en-US')}` }),
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
