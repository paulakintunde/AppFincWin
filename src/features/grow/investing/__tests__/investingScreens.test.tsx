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
  return { DetailScreen: (p: { title: string; right?: React.ReactNode; children?: React.ReactNode }) => R.createElement(View, null, R.createElement(RNText, null, p.title), p.right, p.children) };
});
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', today: '2026-11-06', userId: 'u1', householdId: 'h1', ready: true, showCents: false, region: null }),
}));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: { investing_floor: 20000 } }) }));
const mockAddHolding = jest.fn(() => ({ id: 'new', stepId: 's1' }));
const mockAddLot = jest.fn(() => ({ id: 'lot', stepId: 's2' }));
const mockEditHolding = jest.fn(() => 'se');
const mockRemoveHolding = jest.fn(() => 'rm');
const mockEditLot = jest.fn(() => 'sl');
const mockRemoveLot = jest.fn(() => 'rl');
jest.mock('@/data/mutations/growHoldings', () => {
  const actual = jest.requireActual('@/data/mutations/growHoldings');
  return {
    ...actual,
    useAddHolding: () => ({ add: mockAddHolding }),
    useAddHoldingLot: () => ({ add: mockAddLot }),
    useEditHolding: () => ({ edit: mockEditHolding, remove: mockRemoveHolding }),
    useEditHoldingLot: () => ({ edit: mockEditLot, remove: mockRemoveLot }),
  };
});
const mockToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (a: unknown) => mockToast(a) }));
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
  mockEditHolding.mockClear();
  mockRemoveHolding.mockClear();
  mockEditLot.mockClear();
  mockRemoveLot.mockClear();
  mockToast.mockClear();
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
      expect(screen.getByLabelText(new RegExp(`${h.name}.*as of Nov 1`))).toBeTruthy();
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

  it('06-19: "See what it could grow to" opens the illustration with the totals', async () => {
    await renderIt(<InvestingSegment />);
    await fireEvent.press(screen.getByTestId('investing-see-growth'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/grow/calculators/illustration',
      params: { start: '769000', monthly: '20000' },
    });
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
    expect(screen.queryByLabelText(/Values you typed, from/)).toBeNull();
    expect(screen.getByText(en.grow.investing.detail.chartAfterSecond)).toBeTruthy();
  });

  it('draws the chart from the second value', async () => {
    mockLots = [lot({ id: 'v1', local_date: '2026-10-01', amount: 600000 }), lot({ id: 'v2', local_date: '2026-11-01' })];
    mockRead = readOf(mockHoldings, mockLots);
    await renderIt(<HoldingDetailScreen id="h-ret" />);
    expect(screen.getByLabelText(/Values you typed, from .* Latest \$6,450\./)).toBeTruthy();
    expect(screen.queryByText(en.grow.investing.detail.chartAfterSecond)).toBeNull();
  });

  it('06-19: a holding with a rate opens the illustration with its value, rate and monthly amount', async () => {
    mockHoldings = [holding({ rate: '4', monthly_amount: 15000 })];
    mockRead = readOf(mockHoldings);
    await renderIt(<HoldingDetailScreen id="h-ret" />);
    await fireEvent.press(screen.getByTestId('holding-growth-row'));
    const arg = mockPush.mock.calls[0]![0] as { pathname: string; params: Record<string, string> };
    expect(arg.pathname).toBe('/grow/calculators/illustration');
    expect(arg.params.rate).toBe('4');
    expect(arg.params.monthly).toBe('15000');
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

describe('06-33 edit and remove (D-32)', () => {
  it('Investing shows loading blocks, not nothing', async () => {
    mockRead = { ...readOf([]), status: 'loading' };
    await renderIt(<InvestingSegment />);
    expect(screen.getByTestId('grow-investing-loading')).toBeTruthy();
  });

  it('puts + Add a holding as a row inside the list card', async () => {
    await renderIt(<InvestingSegment />);
    await fireEvent.press(screen.getByTestId('investing-add-row'));
    expect(screen.getByText(en.grow.investing.add.save)).toBeTruthy();
  });

  it('the row menu Edit opens the holding sheet filled in', async () => {
    await renderIt(<InvestingSegment />);
    await fireEvent.press(screen.getByLabelText('More for Retirement fund'));
    await fireEvent.press(screen.getByText(en.grow.investing.detail.edit));
    expect(screen.getByText(en.grow.investing.add.editTitle)).toBeTruthy();
    expect(screen.getByTestId('holding-name').props.value).toBe('Retirement fund');
  });

  it('the row menu Update value opens the update sheet', async () => {
    await renderIt(<InvestingSegment />);
    await fireEvent.press(screen.getByLabelText('More for Retirement fund'));
    await fireEvent.press(screen.getByText(en.grow.investing.detail.updateValue));
    expect(screen.getByText(en.grow.investing.update.save)).toBeTruthy();
  });

  it('the row menu Remove asks first, then removes once with Undo (06-37 D-37)', async () => {
    await renderIt(<InvestingSegment />);
    await fireEvent.press(screen.getByLabelText('More for Retirement fund'));
    expect(screen.queryByText('Delete')).toBeNull();
    await fireEvent.press(screen.getByText('Remove'));
    expect(screen.getByText('Remove Retirement fund?')).toBeTruthy();
    expect(mockRemoveHolding).not.toHaveBeenCalled();
    await fireEvent.press(screen.getAllByText('Remove').slice(-1)[0]!);
    expect(mockRemoveHolding).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'rm', text: expect.objectContaining({ key: 'undo.label.holdingRemoved' }) }));
  });
});

describe('06-33 entries and the holding header', () => {
  const buy = () => lot({ id: 'e1', kind: 'buy', amount: 15000, units: '2', local_date: '2026-10-01', note: 'monthly' });

  it('an entry row is a button that opens the entry to edit, kind read-only', async () => {
    mockLots = [buy()];
    mockRead = readOf(mockHoldings, mockLots);
    await renderIt(<HoldingDetailScreen id="h-ret" />);
    expect(screen.getByLabelText('Buy, Oct 1, $150. Edit the entry.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('entry-e1'));
    expect(screen.getByText(en.grow.investing.entry.editTitle)).toBeTruthy();
    expect(screen.getByTestId('lot-units').props.value).toBe('2');
    expect(screen.getByTestId('lot-date').props.value).toBe('2026-10-01');
    expect(screen.queryByText(en.grow.investing.entry.sale)).toBeNull();
  });

  it('saving an entry sends the changed keys only, with a toast and Undo', async () => {
    mockLots = [buy()];
    mockRead = readOf(mockHoldings, mockLots);
    await renderIt(<HoldingDetailScreen id="h-ret" />);
    await fireEvent.press(screen.getByTestId('entry-e1'));
    await fireEvent.changeText(screen.getByLabelText(en.grow.investing.entry.amount), '200');
    await fireEvent.press(screen.getByText(en.grow.investing.entry.save));
    expect(mockEditLot).toHaveBeenCalledTimes(1);
    const args = mockEditLot.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(args[1]).toEqual({ amount: 20000 });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'sl', text: expect.objectContaining({ key: 'undo.label.holdingEntryEdited' }) }));
  });

  it('a sale edited above the units held shows the text and does not save', async () => {
    mockLots = [
      lot({ id: 'b1', kind: 'buy', amount: 100000, units: '2', local_date: '2026-09-01' }),
      lot({ id: 's1', kind: 'sell', amount: 50000, units: '1', local_date: '2026-10-01' }),
    ];
    mockRead = readOf(mockHoldings, mockLots);
    await renderIt(<HoldingDetailScreen id="h-ret" />);
    await fireEvent.press(screen.getByTestId('entry-s1'));
    await fireEvent.changeText(screen.getByTestId('lot-units'), '5');
    expect(screen.getByTestId('lot-exceeds')).toBeTruthy();
    await fireEvent.press(screen.getByText(en.grow.investing.entry.save));
    expect(mockEditLot).not.toHaveBeenCalled();
  });

  it('Remove entry confirms, then removes once with Undo', async () => {
    mockLots = [buy()];
    mockRead = readOf(mockHoldings, mockLots);
    await renderIt(<HoldingDetailScreen id="h-ret" />);
    await fireEvent.press(screen.getByTestId('entry-e1'));
    await fireEvent.press(screen.getByTestId('lot-remove'));
    expect(screen.getByText('Remove Buy · Oct 1 · $150?')).toBeTruthy();
    expect(screen.getByText('The gain on Retirement fund is worked out again without it.')).toBeTruthy();
    expect(mockRemoveLot).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(en.grow.investing.entry.removeConfirm));
    expect(mockRemoveLot).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'rl', text: expect.objectContaining({ key: 'undo.label.holdingEntryRemoved' }) }));
  });

  it('a value entry opens the update sheet filled in and edits the amount', async () => {
    mockLots = [lot({ id: 'v1', local_date: '2026-11-01', amount: 645000 })];
    mockRead = readOf(mockHoldings, mockLots);
    await renderIt(<HoldingDetailScreen id="h-ret" />);
    await fireEvent.press(screen.getByTestId('entry-v1'));
    expect(screen.getByText(en.grow.investing.entry.editTitle)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(en.grow.investing.update.field), '6500');
    await fireEvent.press(screen.getByText(en.grow.investing.update.save));
    const args = mockEditLot.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(args[1]).toEqual({ amount: 650000 });
  });

  it('the header Edit opens the holding sheet without Value now or As of, and sends changed keys', async () => {
    await renderIt(<HoldingDetailScreen id="h-ret" />);
    await fireEvent.press(screen.getByTestId('holding-edit'));
    expect(screen.getByText(en.grow.investing.add.editTitle)).toBeTruthy();
    expect(screen.queryByLabelText(en.grow.investing.add.valueNow)).toBeNull();
    expect(screen.queryByTestId('holding-as-of')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('holding-name'), 'Pension pot');
    await fireEvent.press(screen.getByText(en.grow.investing.add.saveEdit));
    expect(mockEditHolding).toHaveBeenCalledTimes(1);
    const args = mockEditHolding.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(args[1]).toEqual({ name: 'Pension pot' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'se', text: expect.objectContaining({ key: 'undo.label.holdingEdited' }) }));
  });

  it('the empty entries state offers Update value, and Remove holding is a text button', async () => {
    await renderIt(<HoldingDetailScreen id="h-ret" />);
    const empty = screen.getAllByText(en.grow.investing.detail.entriesEmptyAction);
    expect(empty.length).toBeGreaterThan(0);
    await fireEvent.press(empty[empty.length - 1]!);
    expect(screen.getByText(en.grow.investing.update.save)).toBeTruthy();
    expect(screen.getByTestId('holding-remove')).toBeTruthy();
  });
});
