/** Plan 05.3-24: Check a purchase core: default General, disabled-then-enabled "Check it", commit + navigation, focus=price. */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { readStoredCheck, toStoredV2 } from '@/engine/decide/v3';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { emptyCheck, withPrice } from '../../model/checkEdits';
import { CheckScreen } from '../CheckScreen';

jest.setTimeout(60000);

const ID = '11111111-1111-4111-8111-111111111111';
const mockCreate = jest.fn();
const mockSaveDraft = jest.fn();
const mockSaveAnswer = jest.fn();
const mockPush = jest.fn();
const mockFocus = jest.fn();
let mockRows: unknown[] = [];
let mockStatusRow: Record<string, unknown> | null = null;

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: false, ready: true }),
}));
jest.mock('@/features/decide/v3/check/useOwnOptions', () => ({
  useOwnOptions: () => ({ itemTypes: [], purposes: [], retired: new Map(), liveCount: { itemTypes: 0, purposes: 0 }, add: jest.fn() }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/data/queries/decide', () => ({ useDecideChecks: () => ({ data: mockRows }) }));
jest.mock('@/data/mutations/decideChecks', () => ({
  useCreateCheck: () => ({ create: mockCreate, pendingIds: [], pendingRows: [] }),
  useSaveCheckDraft: () => ({ save: mockSaveDraft }),
  useSaveCheckAnswer: () => ({ save: mockSaveAnswer }),
}));
jest.mock('@tanstack/react-query', () => ({ useMutationState: () => [], useQueryClient: () => ({ setQueriesData: jest.fn() }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (href: unknown) => mockPush(href), replaceOnce: (href: unknown) => mockPush(href) }));
jest.mock('@/shell/a11yFocus', () => ({ useScreenTitleFocus: () => undefined }));
jest.mock('@/shell/header/DetailHeader', () => {
  const { View, Text } = jest.requireActual('react-native');
  return { DetailHeader: ({ title, right }: { title: string; right: React.ReactNode }) => (<View><Text>{title}</Text>{right}</View>) };
});
jest.mock('../../nav/hrefs', () => ({ answerHref: (id: string) => `/decide/answer/${id}` }));
jest.mock('../../shared/useV3Format', () => ({
  useV3Format: () => ({ money: (minor: number) => `$${Math.round(minor / 100).toLocaleString('en-US')}` }),
}));
jest.mock('@/data/queries/decideCheckV3', () => {
  const { readStoredCheck: read } = jest.requireActual('@/engine/decide/v3');
  const thresholds = {
    bandEdges: [5000, 10000, 50000, 100000, 500000, 1000000, 2000000, 5000000, 10000000, 50000000, 100000000, 200000000, 500000000, 1000000000],
    unspentDrift: 0, quotedTolerance: 0, source: 'table',
  };
  return {
    useCheckV3: (_id: string, opts?: { inputs?: unknown }) => {
      const price = opts?.inputs === undefined ? null : (read(opts.inputs).check.price as number | null);
      const band = price === null || price === 0 ? 1 : price >= 100000 ? 5 : 3;
      const layers = band === 5 ? ['L0', 'L1p', 'L2'] : ['L0'];
      return {
        status: 'ready', row: null, inputs: { thresholds }, withoutRefunds: null, refetch: jest.fn(),
        evaluation: {
          result: { code: 'fits_month', variant: null, facts: [], readyBy: null, band, layers, confidence: { level: 'fair', reasons: mockNoSetup() ? ['no_setup'] : [] }, readiness: { ready: true, missing: [] } },
          purchase: { band, layers },
        },
      };
    },
  };
});
function mockNoSetup(): boolean {
  return mockStatusRow !== null;
}

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };
const wrap = (): React.JSX.Element => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <ThemeProvider>
      <CheckScreen id={ID} focus={null} />
    </ThemeProvider>
  </SafeAreaProvider>
);

function storedRow(price: number | null) {
  const c = price === null ? emptyCheck() : withPrice(emptyCheck(), price as never);
  return { id: ID, name: 'Sofa', status: 'open', furthest_step: 1, version: 1, created_by: 'u1', household_id: 'h1', inputs: toStoredV2(c) };
}

describe('CheckScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRows = [storedRow(null)];
    mockStatusRow = null;
  });

  it('shows the title, General selected by default, and no band chip effect on the pay mode', async () => {
    await render(wrap());
    expect(screen.getByText('What are you thinking of buying?')).toBeTruthy();
    expect(screen.getByLabelText('General').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Vehicle').props.accessibilityState.selected).toBe(false);
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('disables Check it with the reason until a price is above 0, then enables it', async () => {
    await render(wrap());
    const cta = () => screen.getByLabelText('Check it');
    expect(cta().props.accessibilityState.disabled).toBe(true);
    expect(cta().props.accessibilityHint).toBe('A price is needed first.');
    expect(screen.getByText('A price is needed first.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Price'), '1200');
    expect(cta().props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByText('A price is needed first.')).toBeNull();
    expect(screen.getByText(/^Band 5/)).toBeTruthy();
  });

  it('refuses a too-large price, says so, and keeps the last valid price', async () => {
    await render(wrap());
    const TOO_BIG = 'That price is past the range Decide can check.';
    await fireEvent.changeText(screen.getByLabelText('Price'), '300');
    await fireEvent.changeText(screen.getByLabelText('Price'), '10000000000');
    expect(screen.getByText(TOO_BIG)).toBeTruthy();
    expect(screen.getByLabelText('Check it').props.accessibilityState.disabled).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });
    for (const call of mockSaveDraft.mock.calls) {
      expect(readStoredCheck(call[0].inputs).check.price).not.toBe(1_000_000_000_000);
    }
    await fireEvent.changeText(screen.getByLabelText('Price'), '300');
    expect(screen.queryByText(TOO_BIG)).toBeNull();
    expect(screen.getByLabelText('Check it').props.accessibilityState.disabled).toBe(false);
  });

  it('opens a stored too-large draft with the message and Check it disabled', async () => {
    mockRows = [storedRow(1_000_000_000_000)];
    await render(wrap());
    expect(screen.getByText('That price is past the range Decide can check.')).toBeTruthy();
    expect(screen.getByLabelText('Check it').props.accessibilityState.disabled).toBe(true);
  });

  it('writes the stored answer and opens the answer only when Check it is pressed', async () => {
    await render(wrap());
    await fireEvent.changeText(screen.getByLabelText('Price'), '1200');
    expect(mockSaveAnswer).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Check it'));
    expect(mockSaveAnswer).toHaveBeenCalledTimes(1);
    expect(mockSaveAnswer.mock.calls[0]![1]).toMatchObject({ v: 3, code: 'fits_month' });
    expect(mockPush).toHaveBeenCalledWith(`/decide/answer/${ID}`);
  });

  it('edits the item type and the pay mode through the check edits', async () => {
    await render(wrap());
    await fireEvent.press(screen.getByLabelText('Vehicle'));
    await fireEvent.press(screen.getByLabelText('Periodic payments'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });
    const sent = mockSaveDraft.mock.calls.at(-1)![0].inputs;
    const check = readStoredCheck(sent).check;
    expect(check.itemType).toEqual({ kind: 'preset', value: 'vehicle' });
    expect(check.pay.mode).toBe('plan');
  });

  it('shows a stored retired item type as one read-only selected chip', async () => {
    const c = { ...emptyCheck(), itemType: { kind: 'preset', value: 'rent_bill' } };
    mockRows = [{ ...storedRow(null), inputs: toStoredV2(c as never) }];
    await render(wrap());
    expect(screen.getByLabelText('Rent or bill').props.accessibilityState.selected).toBe(true);
  });

  it('shows the reassurance tile only when setup is complete', async () => {
    await render(wrap());
    expect(screen.getByTestId('reassure-tile')).toBeTruthy();
    await screen.unmount();
    mockStatusRow = {};
    await render(wrap());
    expect(screen.queryByTestId('reassure-tile')).toBeNull();
  });

  it('renders the layer slot between the pay toggle and the tile', async () => {
    const { Text } = jest.requireActual('react-native');
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <CheckScreen id={ID} focus={null} renderLayers={() => <Text>{'layer slot'}</Text>} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByText('layer slot')).toBeTruthy();
  });

  it('focuses the price field when it arrives with focus=price', async () => {
    const spy = jest.spyOn(require('react-native').TextInput.prototype, 'focus').mockImplementation(mockFocus);
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <CheckScreen id={ID} focus="price" />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(mockFocus).toHaveBeenCalled();
    spy.mockRestore();
  });
});
