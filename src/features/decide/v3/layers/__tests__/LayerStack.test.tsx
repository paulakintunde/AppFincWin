/** Plan 05.3-40: LayerStack shows the cards the engine's layer list asks for, in order, and hides without editing (I43). */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { CheckV2, Evaluation, Layer } from '@/engine/decide/v3';
import { emptyCheck, withItemType, withPayMode, withPrice, withPurpose } from '../../model/checkEdits';
import { LayerStack } from '../LayerStack';
import { Wrap } from './harness';

jest.setTimeout(60000);

jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('../../nav/hrefs', () => ({ planHref: (id: string) => `/decide/plan/${id}` }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: false, ready: true }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/data/queries/recurringSeries', () => ({
  useRecurringSeries: () => ({
    data: [
      { id: 's1', name: 'Car insurance', amount: 14000, category_id: 'cat-ins', freq: 'monthly', end_date: null, deleted_at: null },
      { id: 's2', name: 'Old cover', amount: 9000, category_id: 'cat-ins', freq: 'monthly', end_date: '2020-01-01', deleted_at: null },
    ],
  }),
}));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ byId: new Map([['cat-ins', { id: 'cat-ins', builtin_key: 'Insurance' }]]) }),
}));
jest.mock('../../shared/useV3Format', () => ({
  useV3Format: () => ({ money: (minor: number) => `$${Math.round(minor / 100).toLocaleString('en-US')}` }),
}));

function evalWith(layers: Layer[], band = 5): Evaluation {
  return { result: { band, layers }, purchase: { band, layers, schedule: null }, planCard: null } as unknown as Evaluation;
}

function stack(check: CheckV2, evaluation: Evaluation | null, edit = jest.fn()) {
  return <Wrap><LayerStack check={check} evaluation={evaluation} edit={edit} checkId="c" /></Wrap>;
}

describe('LayerStack', () => {
  it('shows nothing before the engine has a layer list for an at-once general check', async () => {
    await render(stack(emptyCheck(), null));
    expect(screen.queryByTestId('purpose-block')).toBeNull();
    expect(screen.queryByTestId('payment-plan-card')).toBeNull();
  });

  it('shows the purpose block when the layers include L1p, and hides it (keeping the answer) when they do not', async () => {
    const edit = jest.fn();
    const chosen = withPurpose(emptyCheck(), { kind: 'preset', value: 'treat' });
    const { rerender } = await render(stack(chosen, evalWith(['L0', 'L1p'], 3), edit));
    expect(screen.getByTestId('purpose-block')).toBeTruthy();
    await rerender(stack(chosen, evalWith(['L0'], 1), edit));
    expect(screen.queryByTestId('purpose-block')).toBeNull();
    expect(edit).not.toHaveBeenCalled();
    expect(chosen.purpose).toEqual({ kind: 'preset', value: 'treat' });
  });

  it('shows the payment plan card in plan mode and the costs card for an item type with questions, in order', async () => {
    const check = withPayMode(withItemType(withPrice(emptyCheck(), 2700000 as never), { kind: 'preset', value: 'vehicle' }), 'plan');
    await render(stack(check, evalWith(['L0', 'L1p', 'L2', 'L3', 'L4', 'L5'], 8)));
    expect(screen.getByTestId('purpose-block')).toBeTruthy();
    expect(screen.getByTestId('payment-plan-card')).toBeTruthy();
    expect(screen.getByTestId('item-costs-card')).toBeTruthy();
    // only the live saved payment is offered
    expect(screen.getByLabelText('You pay $140 a month for Car insurance now. Use it?')).toBeTruthy();
  });

  it('shows no costs card when the engine does not list L4', async () => {
    await render(stack(emptyCheck(), evalWith(['L0', 'L1p', 'L2'], 6)));
    expect(screen.queryByTestId('item-costs-card')).toBeNull();
  });
});
