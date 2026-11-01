/** Plan 05.3-40: item costs card: preset questions, tax percent with the engine's hint, deposit never asked, prefill only on "Use it". */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { CheckV2 } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { emptyCheck, withItemType, withPrice } from '../../model/checkEdits';
import type { PrefillSeries } from '../../model/costPrefill';
import { ItemCostsCard } from '../ItemCostsCard';
import { Stateful } from './harness';

jest.setTimeout(60000);

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: false, ready: true }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('../../shared/useV3Format', () => ({
  useV3Format: () => ({ money: (minor: number) => `$${Math.round(minor / 100).toLocaleString('en-US')}` }),
}));

const SERIES: PrefillSeries[] = [{ id: 's1', name: 'Car insurance', amount: minorUnits(14000), categoryKey: 'Insurance', freq: 'monthly' }];

function typed(value: 'vehicle' | 'tuition' | 'subscription' | 'general', price: number | null = 2700000): CheckV2 {
  const base = withItemType(emptyCheck(), { kind: 'preset', value });
  return price === null ? base : withPrice(base, price as never);
}

function mount(initial: CheckV2, series: PrefillSeries[] = SERIES, onCheck?: (c: CheckV2) => void) {
  return render(
    <Stateful initial={initial} onCheck={onCheck}>
      {({ check, edit }) => <ItemCostsCard check={check} edit={edit} currency="USD" prefillSeries={series} />}
    </Stateful>,
  );
}

describe('ItemCostsCard', () => {
  it('vehicle: the preset captions, an amount field each, no deposit and no sales_tax amount field', async () => {
    await mount(typed('vehicle'));
    expect(screen.getByText('Car costs to consider')).toBeTruthy();
    for (const c of ['Insurance (a month)', 'Fuel or charging (a month)', 'Maintenance (a year)', 'Registration (a year)', 'Loss of value (a year)', 'Dealer fees', 'Trade-in value']) {
      expect(screen.getByLabelText(c)).toBeTruthy();
    }
    expect(screen.queryByLabelText('Down payment')).toBeNull();
    expect(screen.getAllByLabelText('Sales tax or levy (%)')).toHaveLength(1);
  });

  it('amount fields start empty (D-05) and write extras', async () => {
    let latest = typed('vehicle');
    await mount(latest, [], (c) => { latest = c; });
    expect(latest.extras).toEqual({});
    await fireEvent.changeText(screen.getByLabelText('Dealer fees'), '300');
    expect(latest.extras.dealer_fees).toBe(30000);
  });

  it('tax is a percent written to taxPercent with the engine hint, never to extras', async () => {
    let latest = typed('vehicle', 2700000);
    await mount(latest, [], (c) => { latest = c; });
    await fireEvent.changeText(screen.getByLabelText('Sales tax or levy (%)'), '7');
    expect(latest.taxPercent).not.toBeNull();
    expect(Object.keys(latest.extras)).toEqual([]);
    expect(screen.getByText('about $1,890')).toBeTruthy();
  });

  it('shows the hint only once there is a price and a rate', async () => {
    await mount(typed('vehicle', null));
    await fireEvent.changeText(screen.getByLabelText('Sales tax or levy (%)'), '7');
    expect(screen.queryByText(/^about /)).toBeNull();
  });

  it('an empty tax field clears taxPercent', async () => {
    let latest = typed('vehicle');
    await mount(latest, [], (c) => { latest = c; });
    const f = screen.getByLabelText('Sales tax or levy (%)');
    await fireEvent.changeText(f, '7');
    await fireEvent.changeText(f, '');
    expect(latest.taxPercent).toBeNull();
  });

  it('offers a matching saved payment and fills only on "Use it"', async () => {
    let latest = typed('vehicle');
    await mount(latest, SERIES, (c) => { latest = c; });
    expect(screen.getByLabelText('You pay $140 a month for Car insurance now. Use it?')).toBeTruthy();
    expect(latest.extras.insurance_monthly).toBeUndefined();
    await fireEvent.press(screen.getByLabelText('Use it'));
    expect(latest.extras.insurance_monthly).toBe(14000);
    expect(screen.queryByLabelText('Use it')).toBeNull();
  });

  it('offers nothing when the records hold no match', async () => {
    await mount(typed('vehicle'), []);
    expect(screen.queryByLabelText('Use it')).toBeNull();
  });

  it('tuition: yes/no and date answers are stored as layer answers, not extras', async () => {
    let latest = typed('tuition');
    await mount(latest, [], (c) => { latest = c; });
    await fireEvent.press(screen.getAllByLabelText('Yes')[0]!);
    expect(Object.values(latest.layerAnswers)).toContain(true);
    expect(Object.keys(latest.extras)).toEqual([]);
  });

  it('05.3-113: an own kind asks the questions of the kind it counts like; with no base given it counts as General', async () => {
    const custom: CheckV2 = { ...emptyCheck(), itemType: { kind: 'custom', id: 'c1' } };
    const { unmount } = await mount(custom);
    expect(screen.getByText('Extras to consider')).toBeTruthy();
    expect(screen.queryByText('Car costs to consider')).toBeNull();
    await unmount();
    await render(
      <Stateful initial={custom}>
        {({ check, edit }) => <ItemCostsCard check={check} edit={edit} currency="USD" prefillSeries={[]} itemBase="vehicle" />}
      </Stateful>,
    );
    expect(screen.getByText('Car costs to consider')).toBeTruthy();
  });

  it('a kind with no cost questions has no card', async () => {
    await mount(withItemType(emptyCheck(), { kind: 'preset', value: 'rent_bill' }));
    expect(screen.queryByTestId('item-costs-card')).toBeNull();
  });
});
