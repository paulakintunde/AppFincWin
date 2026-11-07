// 06-18: the Investing segment, holding detail, add-holding, lot and update-value screens. The 06-14 hooks are mocked; the pure
// read model (buildInvestingModel) is the real one so the stale boundary is the engine's.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import en from '@/i18n/locales/en';
import type { HoldingRow } from '@/db/holdings';
import type { HoldingLotRow } from '@/db/holdingLots';
import type { InvestingRead } from '../useInvestingRead';

jest.setTimeout(30000);

const mockPush = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPush(h) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const R = require('react');
  const { View, Text: RNText } = require('react-native');
  return { DetailScreen: (p: { title: string; children?: React.ReactNode }) => R.createElement(View, null, R.createElement(RNText, null, p.title), p.children) };
});
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', today: '2026-11-06', userId: 'u1', householdId: 'h1', ready: true, showCents: false, region: null }),
}));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: { investing_floor: 20000 } }) }));
const mockAddHolding = jest.fn(() => ({ id: 'new', stepId: 's1' }));
const mockAddLot = jest.fn(() => ({ id: 'lot', stepId: 's2' }));
jest.mock('@/data/mutations/growHoldings', () => {
  const actual = jest.requireActual('@/data/mutations/growHoldings');
  return {
    ...actual,
    useAddHolding: () => ({ add: mockAddHolding }),
    useAddHoldingLot: () => ({ add: mockAddLot }),
    useEditHolding: () => ({ edit: jest.fn(), remove: jest.fn(() => 'rm') }),
  };
});
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));

let mockRead: InvestingRead;
jest.mock('../useInvestingRead', () => {
  const actual = jest.requireActual('../useInvestingRead');
  return { ...actual, useInvestingRead: () => mockRead };
});

let mockHoldings: HoldingRow[] = [];
let mockLots: HoldingLotRow[] = [];
jest.mock('@/data/queries/growHoldings', () => ({
  useHoldingRows: () => ({ data: mockHoldings }),
  useHoldingLotRows: () => ({ data: mockLots }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/queries/activity', () => ({ useAccountBalances: () => ({ balances: new Map() }) }));
jest.mock('@/features/decide/past/usePastDecisions', () => ({
  usePastContext: () => ({ userId: 'u1', householdId: 'h1', today: '2026-11-06', ctx: { home: 'USD', rates: [], customs: [], today: '2026-11-06', timeZone: 'UTC' } }),
}));

import { InvestingSegment } from '../InvestingSegment';
import { HoldingDetailScreen } from '../HoldingDetailScreen';
import { AddHoldingSheet, HOLDING_TYPE_OPTIONS } from '../AddHoldingSheet';
import { LotSheet } from '../LotSheet';
import { UpdateValueSheet } from '../UpdateValueSheet';
import { buildInvestingModel } from '../useInvestingRead';

const NOW = '2026-11-06';

function holding(over: Partial<HoldingRow> = {}): HoldingRow {
  return {
    id: 'h-ret', household_id: 'h1', created_by: 'u1', updated_by: null, name: 'Retirement fund', type: 'retirement', currency: 'USD',
    value: 645000, value_as_of: '2026-11-01', opening_put_in: 580000, account_id: null, paid_from_account_id: null, monthly_amount: 15000,
    day: 1, rate: null, is_sample: false, deleted_at: null, version: 1, created_at: '', updated_at: '', ...over,
  } as HoldingRow;
}
function lot(over: Partial<HoldingLotRow>): HoldingLotRow {
  return {
    id: 'l1', holding_id: 'h-ret', household_id: 'h1', created_by: 'u1', updated_by: null, kind: 'value', amount: 645000, units: null,
    local_date: '2026-11-01', note: null, is_sample: false, deleted_at: null, version: 1, created_at: '', updated_at: '', ...over,
  } as HoldingLotRow;
}
const toHome = (a: number) => a;

function readOf(rows: HoldingRow[], lots: HoldingLotRow[] = []): InvestingRead {
  return {
    status: 'ready',
    model: buildInvestingModel(rows, lots, toHome, NOW),
    refetch: jest.fn(),
    userId: 'u1',
    householdId: 'h1',
    today: NOW,
  };
}

async function renderIt(node: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }}>
      <ThemeProvider>
        <FontScaleProvider value={1}>{node}</FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  mockAddHolding.mockClear();
  mockAddLot.mockClear();
  mockHoldings = [holding(), holding({ id: 'h-idx', name: 'Index fund', type: 'brokerage', value: 124000, opening_put_in: 120000, monthly_amount: 5000 })];
  mockLots = [];
  mockRead = readOf(mockHoldings);
});

describe('Investing segment', () => {
  it('shows the hero, rows with as-of dates, gain and the allocation legend', async () => {
    await renderIt(<InvestingSegment />);
    expect(screen.getByTestId('investing-hero')).toHaveTextContent('$7,690');
    expect(screen.getByText(/\$690 above what you put in · values you typed, as of Nov 1\./)).toBeTruthy();
    expect(screen.getByText('Retirement · $150 a month · as of Nov 1')).toBeTruthy();
    expect(screen.getByText('+$650')).toBeTruthy();
    expect(screen.getByText('Retirement 84% · Brokerage 16%', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText(en.grow.investing.noPrices)).toBeTruthy();
    expect(screen.getByText('Investing · $200 a month. Your rule is at least $200.')).toBeTruthy();
    expect(screen.getByText(en.grow.investing.met)).toBeTruthy();
  });

  it('every value display carries its as-of date', async () => {
    await renderIt(<InvestingSegment />);
    for (const h of mockHoldings) {
      const row = screen.getByTestId(`holding-row-${h.id}`);
      expect(row.props.accessibilityLabel).toMatch(/as of Nov 1/);
    }
  });

  it('a holding at exactly 30 days is not stale; at 31 days it is, with one summary row', async () => {
    mockRead = readOf([holding({ value_as_of: '2026-10-07' })]);
    const first = await renderIt(<InvestingSegment />);
    expect(screen.queryByTestId('investing-stale-row')).toBeNull();
    await first.unmount();
    mockRead = readOf([holding({ value_as_of: '2026-10-06' }), holding({ id: 'h2', name: 'Other', value_as_of: '2026-10-03' })]);
    await renderIt(<InvestingSegment />);
    expect(screen.getAllByTestId('investing-stale-row')).toHaveLength(1);
    expect(screen.getByText(en.grow.investing.staleRow)).toBeTruthy();
    expect(screen.getByText('Last updated Oct 3')).toBeTruthy();
  });

  it('a loss reads below and is announced in words', async () => {
    mockRead = readOf([holding({ value: 570000 })]);
    await renderIt(<InvestingSegment />);
    expect(screen.getByText('-$100')).toBeTruthy();
    expect(screen.getByLabelText('$100 below what you put in')).toBeTruthy();
  });

  it('opens its own Add a holding sheet with no onAdd', async () => {
    mockRead = readOf([]);
    await renderIt(<InvestingSegment />);
    expect(screen.getByTestId('grow-investing-empty')).toBeTruthy();
    await fireEvent.press(screen.getByText(en.grow.investing.emptyAction));
    expect(screen.getByText(en.grow.investing.add.save)).toBeTruthy();
  });

  it('a row opens the holding detail route', async () => {
    await renderIt(<InvestingSegment />);
    await fireEvent.press(screen.getByTestId('holding-row-h-ret'));
    expect(mockPush).toHaveBeenCalledWith('/grow/holding/h-ret');
  });
});

describe('Add a holding', () => {
  it('offers exactly five plain-word types', async () => {
    await renderIt(<AddHoldingSheet visible onClose={() => undefined} />);
    expect(HOLDING_TYPE_OPTIONS).toHaveLength(5);
    expect(screen.getByTestId('holding-type-options').children).toHaveLength(5);
    for (const word of ['Brokerage', 'Retirement', 'Pension', 'Crypto', 'Other']) expect(screen.getByText(word)).toBeTruthy();
    expect(screen.queryByText(/401\(k\)|ISA|TFSA|RRSP/)).toBeNull();
  });

  it('keeps save off until the name, amounts and date are in', async () => {
    await renderIt(<AddHoldingSheet visible onClose={() => undefined} />);
    await fireEvent.press(screen.getByText(en.grow.investing.add.save));
    expect(mockAddHolding).not.toHaveBeenCalled();
  });
});

describe('Lot sheet', () => {
  it('refuses a sale above the units held and shows the helper', async () => {
    const h = holding();
    await renderIt(<LotSheet visible holding={h} lots={[lot({ id: 'b1', kind: 'buy', amount: 100000, units: '2', local_date: '2026-09-01' })]} onClose={() => undefined} />);
    await fireEvent.press(screen.getByText(en.grow.investing.entry.sale));
    await fireEvent.changeText(screen.getByLabelText(en.grow.investing.entry.amount), '500');
    await fireEvent.changeText(screen.getByTestId('lot-units'), '3');
    expect(screen.getByTestId('lot-exceeds')).toBeTruthy();
    await fireEvent.press(screen.getByText(en.grow.investing.entry.save));
    expect(mockAddLot).not.toHaveBeenCalled();
  });

  it('shows the four kinds', async () => {
    await renderIt(<LotSheet visible holding={holding()} lots={[]} onClose={() => undefined} />);
    for (const k of ['buy', 'sale', 'dividend', 'fee'] as const) expect(screen.getByText(en.grow.investing.entry[k])).toBeTruthy();
  });
});

describe('Update value', () => {
  it('previews the change since the last as-of date and saves a value entry', async () => {
    await renderIt(<UpdateValueSheet visible holding={holding()} onClose={() => undefined} />);
    expect(screen.getByTestId('update-preview')).toHaveTextContent('Change since Nov 1: +$0');
    expect(screen.getByText('As of · Today')).toBeTruthy();
    await fireEvent.press(screen.getByText(en.grow.investing.update.save));
    expect(mockAddLot).toHaveBeenCalledWith(expect.objectContaining({ kind: 'value', amount: 645000, date: NOW }));
  });
});

describe('Holding detail', () => {
  it('shows the value with its as-of badge, the gain as a record and the entries', async () => {
    mockLots = [
      lot({ id: 'e1', kind: 'buy', amount: 15000, local_date: '2026-10-01' }),
      lot({ id: 'e2', kind: 'dividend', amount: 1800, local_date: '2026-09-30' }),
      lot({ id: 'e3', kind: 'value', amount: 645000, local_date: '2026-11-01' }),
    ];
    mockRead = readOf(mockHoldings, mockLots);
    await renderIt(<HoldingDetailScreen id="h-ret" />);
    expect(screen.getByTestId('holding-value')).toHaveTextContent('$6,450');
    expect(screen.getByText('As of Nov 1')).toBeTruthy();
    expect(screen.getByTestId('holding-gain-line')).toHaveTextContent(/\$500 above the \$5,950 you put in · 8\.4%/);
    expect(screen.getByText('Buy · Oct 1 · $150')).toBeTruthy();
    expect(screen.getByText('Dividend · Sep 30 · $18')).toBeTruthy();
    expect(screen.getByText('Value update · Nov 1 · $6,450')).toBeTruthy();
    expect(screen.getByText(en.grow.investing.taxNote)).toBeTruthy();
    expect(screen.getByLabelText(/Values you typed, from .* Latest \$6,450\./)).toBeTruthy();
  });

  it('shows the quiet Update value row only after 30 days', async () => {
    mockHoldings = [holding({ value_as_of: '2026-10-07' })];
    mockRead = readOf(mockHoldings);
    const first = await renderIt(<HoldingDetailScreen id="h-ret" />);
    expect(screen.queryByTestId('holding-stale-row')).toBeNull();
    await first.unmount();
    mockHoldings = [holding({ value_as_of: '2026-10-06' })];
    mockRead = readOf(mockHoldings);
    await renderIt(<HoldingDetailScreen id="h-ret" />);
    expect(screen.getByTestId('holding-stale-row')).toBeTruthy();
    expect(screen.getByText('Last updated Oct 6')).toBeTruthy();
  });

  it('a holding that is gone says Holding not found with a way back', async () => {
    await renderIt(<HoldingDetailScreen id="gone" />);
    expect(screen.getByTestId('grow-holding-missing')).toBeTruthy();
    expect(screen.getByText('Holding not found')).toBeTruthy();
  });

  it('asks before removing and names the net-worth drop', async () => {
    await renderIt(<HoldingDetailScreen id="h-ret" />);
    await fireEvent.press(screen.getByText(en.grow.investing.detail.remove));
    expect(screen.getByText('Remove Retirement fund?')).toBeTruthy();
    expect(screen.getByText('Its entries go too. Net worth drops by $6,450.')).toBeTruthy();
  });
});
