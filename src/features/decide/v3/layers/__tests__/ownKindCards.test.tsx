/** Plan 05.3-113 (UAT gap 32): an own kind brings the same cards as the built-in kind it counts like; a removed one is General. */
import React from 'react';
import { render, screen, within } from '@testing-library/react-native';
import type { CheckV2, Evaluation, ItemTypeRef, Layer } from '@/engine/decide/v3';
import { emptyCheck, withItemType, withPayMode, withPrice } from '../../model/checkEdits';
import { LayerStack } from '../LayerStack';
import { Wrap } from './harness';

jest.setTimeout(60000);

let mockItemRows: readonly { id: string; name: string; base: string }[] = [];

jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('../../nav/hrefs', () => ({ planHref: (id: string) => `/decide/plan/${id}` }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: false, ready: true, today: '2026-10-31' }),
}));
jest.mock('@/features/decide/v3/check/useOwnOptions', () => ({
  useOwnOptions: () => ({
    itemTypes: [],
    purposes: [],
    itemRows: mockItemRows,
    retired: new Map(),
    liveCount: { itemTypes: mockItemRows.length, purposes: 0 },
    add: jest.fn(),
  }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ byId: new Map() }) }));
jest.mock('../../shared/useV3Format', () => ({
  useV3Format: () => ({ date: (iso: string) => iso, money: (minor: number) => `$${Math.round(minor / 100).toLocaleString('en-US')}` }),
}));

const LAYERS: Layer[] = ['L0', 'L1p', 'L2', 'L3', 'L4', 'L5', 'L6'];

function evalWith(layers: Layer[], band = 12): Evaluation {
  return { result: { band, layers }, purchase: { band, layers, schedule: null }, planCard: null } as unknown as Evaluation;
}

function checkOf(itemType: ItemTypeRef, mode: 'once' | 'plan' = 'once'): CheckV2 {
  const c = withItemType(withPrice(emptyCheck(), 2700000 as never), itemType);
  return mode === 'plan' ? withPayMode(c, 'plan') : c;
}

async function show(itemType: ItemTypeRef, mode: 'once' | 'plan' = 'once'): Promise<void> {
  await render(
    <Wrap>
      <LayerStack check={checkOf(itemType, mode)} evaluation={evalWith(LAYERS)} edit={jest.fn()} checkId="c" />
    </Wrap>,
  );
}

const BIKE: ItemTypeRef = { kind: 'custom', id: 'bike' };
const FLAT: ItemTypeRef = { kind: 'custom', id: 'flat' };
const GONE: ItemTypeRef = { kind: 'custom', id: 'gone' };

beforeEach(() => {
  mockItemRows = [
    { id: 'bike', name: 'Bike', base: 'vehicle' },
    { id: 'flat', name: 'Flat', base: 'property' },
  ];
});

describe('own kinds show the cards of the kind they count like', () => {
  it('the Vehicle preset shows the car costs card (the reference)', async () => {
    await show({ kind: 'preset', value: 'vehicle' });
    expect(within(screen.getByTestId('item-costs-card')).getByText(/car costs to consider/i)).toBeTruthy();
  });

  it('an own kind that counts like Vehicle shows the car costs card, as the Vehicle preset does', async () => {
    await show(BIKE);
    expect(within(screen.getByTestId('item-costs-card')).getByText(/car costs to consider/i)).toBeTruthy();
    expect(screen.getByLabelText('Insurance (a month)')).toBeTruthy();
  });

  it('an own kind that counts like Property asks legal and moving costs the way the Property preset does', async () => {
    await show(FLAT);
    const costs = screen.getByTestId('item-costs-card');
    expect(within(costs).getByText(/home costs to consider/i)).toBeTruthy();
    expect(within(costs).getByLabelText('Legal and closing costs')).toBeTruthy();
    expect(within(costs).getByLabelText('Moving costs')).toBeTruthy();
    const major = screen.getByTestId('major-asset-card');
    expect(within(major).queryByLabelText('Legal and closing costs')).toBeNull();
    expect(within(major).getByText('Asked under item costs above.')).toBeTruthy();
  });

  it('a plan for an own kind that counts like Vehicle shows the vehicle card note, not the general one', async () => {
    await show(BIKE, 'plan');
    const plan = screen.getByTestId('payment-plan-card');
    expect(within(plan).getByText('Most dealers cap card payments for a car.')).toBeTruthy();
    expect(within(plan).queryByText('No card limit applies to this kind of purchase.')).toBeNull();
  });

  it('a plan for an own kind that counts like Property shows the property card note', async () => {
    await show(FLAT, 'plan');
    expect(within(screen.getByTestId('payment-plan-card')).getByText('A property deposit can’t go on a card.')).toBeTruthy();
  });

  it('a removed or unknown own kind renders exactly as General', async () => {
    await show(GONE, 'plan');
    expect(within(screen.getByTestId('item-costs-card')).getByText(/extras to consider/i)).toBeTruthy();
    expect(screen.queryByText(/car costs to consider/i)).toBeNull();
    const major = screen.getByTestId('major-asset-card');
    expect(within(major).getByLabelText('Legal and closing costs')).toBeTruthy();
    expect(within(major).getByLabelText('Moving costs')).toBeTruthy();
    expect(within(major).queryByText('Asked under item costs above.')).toBeNull();
    expect(within(screen.getByTestId('payment-plan-card')).queryByText('Most dealers cap card payments for a car.')).toBeNull();
  });

  it('an own kind removed after it was chosen falls back to General', async () => {
    mockItemRows = [];
    await show(BIKE);
    expect(screen.queryByText(/car costs to consider/i)).toBeNull();
    expect(within(screen.getByTestId('item-costs-card')).getByText(/extras to consider/i)).toBeTruthy();
  });
});
