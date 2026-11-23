import { renderHook } from '@testing-library/react-native';
import { monthsBack, spendLines, useAlertDefaults } from '../useAlertDefaults';
import { useAlertTimeZoneSync } from '../useAlertTimeZoneSync';
import type { AlertSetting } from '@/db/alerts';

let mockHousehold: string | null = 'h1';
let mockSettings: AlertSetting[] = [];
let mockPrefs: { timeZone: string; version: number } | undefined;
let mockZone = 'America/Toronto';
const mockSaveSetting = jest.fn();
const mockSavePrefs = jest.fn();

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: mockHousehold, homeCurrency: 'USD', today: '2026-11-23' }),
}));
jest.mock('@/data/queries/transactions', () => ({ useTransactionsForMonth: () => ({ data: [] }) }));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/alerts', () => ({
  useAlertSettings: () => ({ data: mockSettings }),
  useAlertPrefs: () => ({ data: mockPrefs }),
}));
jest.mock('@/data/mutations/alertSettings', () => ({
  useSaveAlertSetting: () => ({ saveAlertSetting: mockSaveSetting }),
  useSaveAlertPrefs: () => ({ saveAlertPrefs: mockSavePrefs }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({ getDeviceTimeZone: () => mockZone }));

const setting = (over: Partial<AlertSetting> = {}): AlertSetting => ({
  kind: 'large_txn',
  enabled: false,
  thresholdMinor: null,
  thresholdCurrency: null,
  leadDays: null,
  version: 0,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockHousehold = 'h1';
  mockSettings = [setting()];
  mockPrefs = { timeZone: 'UTC', version: 2 };
  mockZone = 'America/Toronto';
});

const row = (over: Record<string, unknown> = {}) => ({
  status: 'paid',
  transfer_id: null,
  is_refund: false,
  original_amount: -1500,
  original_currency: 'USD',
  orig_per_eur: null,
  home_amount: -1500,
  home_currency: 'USD',
  local_date: '2026-11-01',
  ...over,
});

describe('spendLines', () => {
  it('keeps paid outflows and drops transfers, refunds, settlements, income and unpaid rows', async () => {
    const lines = spendLines(
      [
        row(),
        row({ transfer_id: 't1' }),
        row({ is_refund: true }),
        row({ is_settlement: true }),
        row({ original_amount: 900, home_amount: 900 }),
        row({ status: 'planned' }),
        row({ deleted_at: '2026-11-02T00:00:00Z' }),
      ] as never,
      'USD',
      []
    );
    expect(lines).toEqual([{ magnitude: 1500, localDate: '2026-11-01' }]);
  });
});

describe('monthsBack', () => {
  it('crosses a year boundary', async () => {
    expect(monthsBack('2026-01', 1)).toBe('2025-12');
    expect(monthsBack('2026-11', 3)).toBe('2026-08');
  });
});

describe('useAlertDefaults', () => {
  it('falls back to flat 200 and 100 in the home currency with no history', async () => {
    const { result } = await renderHook(() => useAlertDefaults('u1'));
    expect(result.current.suggested.large).toEqual({ minor: 20000, basis: 'flat' });
    expect(result.current.suggested.low).toEqual({ minor: 10000, basis: 'flat' });
  });

  it('saves an off large_txn threshold once for a household member with none', async () => {
    const { result } = await renderHook(() => useAlertDefaults('u1'));
    result.current.ensurePartnerThreshold();
    result.current.ensurePartnerThreshold();
    expect(mockSaveSetting).toHaveBeenCalledTimes(1);
    expect(mockSaveSetting).toHaveBeenCalledWith({
      userId: 'u1',
      setting: { kind: 'large_txn', enabled: false, thresholdMinor: 20000, thresholdCurrency: 'USD', leadDays: null },
      baseVersion: 0,
    });
  });

  it('saves nothing when there is no household or a threshold already exists', async () => {
    mockHousehold = null;
    const a = await renderHook(() => useAlertDefaults('u1'));
    a.result.current.ensurePartnerThreshold();
    mockHousehold = 'h1';
    mockSettings = [setting({ thresholdMinor: 5000, thresholdCurrency: 'USD' })];
    const b = await renderHook(() => useAlertDefaults('u1'));
    b.result.current.ensurePartnerThreshold();
    expect(mockSaveSetting).not.toHaveBeenCalled();
  });
});

describe('useAlertTimeZoneSync', () => {
  it('saves the device zone once when it differs', async () => {
    const { rerender } = await renderHook(() => useAlertTimeZoneSync('u1'));
    await rerender({});
    expect(mockSavePrefs).toHaveBeenCalledTimes(1);
    expect(mockSavePrefs).toHaveBeenCalledWith({ userId: 'u1', patch: { timeZone: 'America/Toronto' }, baseVersion: 2 });
  });

  it('does nothing when the zones match', async () => {
    mockPrefs = { timeZone: 'America/Toronto', version: 1 };
    renderHook(() => useAlertTimeZoneSync('u1'));
    expect(mockSavePrefs).not.toHaveBeenCalled();
  });
});
