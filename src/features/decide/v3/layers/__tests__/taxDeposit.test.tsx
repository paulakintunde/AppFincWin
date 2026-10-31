/** Plan 05.3-40 (M-08, T-05.3-40-02): tax goes to taxPercent and the down payment to pay.deposit, never to the stored extras. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { toStoredV2 } from '@/engine/decide/v3';
import type { CheckV2 } from '@/engine/decide/v3';
import { emptyCheck, withItemType, withPayMode, withPrice } from '../../model/checkEdits';
import { ItemCostsCard } from '../ItemCostsCard';
import { PaymentPlanCard } from '../PaymentPlanCard';
import { Stateful } from './harness';

jest.setTimeout(60000);

jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
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

describe('M-08 tax and deposit storage', () => {
  it('after typing tax 7% and a down payment the stored check has neither in extras', async () => {
    let latest: CheckV2 = withPayMode(withItemType(withPrice(emptyCheck(), 2700000 as never), { kind: 'preset', value: 'vehicle' }), 'plan');
    await render(
      <Stateful initial={latest} onCheck={(c) => { latest = c; }}>
        {({ check, edit }) => (
          <>
            <PaymentPlanCard check={check} evaluation={null} edit={edit} checkId="c" currency="USD" />
            <ItemCostsCard check={check} edit={edit} currency="USD" prefillSeries={[]} />
          </>
        )}
      </Stateful>,
    );
    await fireEvent.changeText(screen.getByLabelText('Sales tax or levy (%)'), '7');
    await fireEvent.changeText(screen.getByLabelText('Down payment'), '4000');
    const stored = toStoredV2(latest) as { extras: Record<string, number>; taxPercent: unknown; pay: { deposit: number } };
    expect(stored.extras.sales_tax).toBeUndefined();
    expect(stored.extras.deposit).toBeUndefined();
    expect(Object.keys(stored.extras)).toEqual([]);
    expect(stored.taxPercent).not.toBeNull();
    expect(stored.pay.deposit).toBe(400000);
    expect(latest.taxPercent).not.toBeNull();
    // the deposit is asked once: the item costs card has no field for it
    expect(screen.getAllByLabelText('Down payment')).toHaveLength(1);
  });

  it('switching to all at once keeps the plan (deposit and rate) for the way back', () => {
    const plan = withPayMode(emptyCheck(), 'plan');
    const back = withPayMode(withPayMode(plan, 'once'), 'plan');
    expect(back.pay).toEqual(plan.pay);
    expect(withPayMode(plan, 'once').layerAnswers['L3.plan']).toBeDefined();
  });
});
