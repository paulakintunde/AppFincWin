import { renderHook, act } from '@testing-library/react-native';
import { toStoredV2 } from '@/engine/decide/v3';
import { buildCheck, routeFor, useNewCheck, type NewCheckFields } from '../useNewCheck';

const mockCreate = jest.fn();
const mockPush = jest.fn();
let mockRegion: string | null = 'US';
let mockCurrency = 'USD';
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/data/mutations/decideChecks', () => ({ useCreateCheck: () => ({ create: mockCreate, pendingIds: [], pendingRows: [] }) }));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ inputs: null, prepared: null }) }));
jest.mock('../../engine/useMonthPicture', () => ({ useMonthPicture: () => ({ picture: { payday: '2026-11-15' }, bars: [] }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: mockCurrency, region: mockRegion, today: '2026-11-11' }),
}));

const fields = (over: Partial<NewCheckFields>): NewCheckFields => ({
  text: 'Laptop',
  price: 350_000,
  when: 'today',
  payMode: 'once',
  purpose: null,
  quickLines: [],
  ...over,
});
const ctx = { country: 'US', nextPayday: '2026-11-15' };
const route = (f: NewCheckFields, currency = 'USD', country: string | null = 'US') =>
  routeFor(buildCheck(f, { country, nextPayday: '2026-11-15' }), { id: 'k1', text: f.text, payMode: f.payMode, currency, country });

describe('buildCheck (D-12, D-21)', () => {
  it('stores purpose want, never asks about an emergency, and carries quick lines', () => {
    const line = { id: 'q1', kind: 'expense' as const, name: 'Insurance', amount: 1200 as never, everyMonths: 1 as const, date: null };
    const c = buildCheck(fields({ purpose: 'want', quickLines: [line] }), ctx);
    expect(c.purpose).toEqual({ kind: 'preset', value: 'nice_to_have' });
    expect(c.emergency).toBe(false);
    expect(c.quickLines).toEqual([line]);
  });

  it('maps a need to necessity and leaves purpose null when not set', () => {
    expect(buildCheck(fields({ purpose: 'need' }), ctx).purpose).toEqual({ kind: 'preset', value: 'necessity' });
    expect(buildCheck(fields({}), ctx).purpose).toBeNull();
  });

  it('reads the item kind from the words', () => {
    expect(buildCheck(fields({ text: 'Used car' }), ctx).itemType).toEqual({ kind: 'preset', value: 'vehicle' });
    expect(buildCheck(fields({ text: 'Laptop' }), ctx).itemType).toEqual({ kind: 'preset', value: 'electronics' });
    expect(buildCheck(fields({ text: 'Sofa' }), ctx).itemType).toEqual({ kind: 'preset', value: 'general' });
  });

  it('marks tax as included by default in the UK but not in the US', () => {
    expect(buildCheck(fields({}), { country: 'GB', nextPayday: null }).taxIncluded).toBe(true);
    expect(buildCheck(fields({}), { country: 'US', nextPayday: null }).taxIncluded).toBe(false);
  });

  it('dates the purchase: today is none, payday is the next payday, a picked date is kept', () => {
    expect(buildCheck(fields({ when: 'today' }), ctx).purchaseDate).toBeNull();
    expect(buildCheck(fields({ when: 'payday' }), ctx).purchaseDate).toBe('2026-11-15');
    expect(buildCheck(fields({ when: { date: '2026-12-01' } }), ctx).purchaseDate).toBe('2026-12-01');
  });

  it('round-trips through the stored form', () => {
    const c = buildCheck(fields({ purpose: 'want' }), ctx);
    expect(() => JSON.stringify(toStoredV2(c))).not.toThrow();
  });
});

describe('routeFor (D-02, D-09)', () => {
  it('blocks a home', () => {
    expect(route(fields({ text: 'a house in Leeds', price: 25_000_000 }))).toBe('blocked');
  });

  it('opens the stepper price step for a used car paid in cash', () => {
    expect(route(fields({ text: 'used car', price: 900_000 }))).toBe('/decide/check/price?id=k1');
  });

  it('sends a laptop paid in cash straight to the answer', () => {
    expect(route(fields({ text: 'laptop', price: 350_000 }))).toBe('/decide/answer/k1');
  });

  it('opens the stepper for a camera paid over time', () => {
    expect(route(fields({ text: 'camera', price: 420_000, payMode: 'plan' }))).toBe('/decide/check/price?id=k1');
  });

  it('opens the kind step first when a large price does not read as a kind', () => {
    expect(route(fields({ text: 'Piano', price: 900_000 }))).toBe('/decide/check/kind?id=k1');
  });

  it('counts a price that includes tax without adding more', () => {
    expect(route(fields({ text: 'Piano', price: 450_000 }), 'GBP', 'GB')).toBe('/decide/check/kind?id=k1');
  });
});

describe('useNewCheck (T-06.1-21-01, T-06.1-21-02)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegion = 'US';
    mockCurrency = 'USD';
  });

  it('writes nothing for a home', async () => {
    const { result } = await renderHook(() => useNewCheck());
    let r: unknown;
    await act(async () => {
      r = result.current.start(fields({ text: 'a house in Leeds', price: 25_000_000 }));
    });
    expect(r).toBe('blocked');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('creates the draft row with a client id, then opens the stepper for a car', async () => {
    const { result } = await renderHook(() => useNewCheck());
    await act(async () => {
      result.current.start(fields({ text: 'used car', price: 900_000, purpose: 'want' }));
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0]![0];
    expect(call).toMatchObject({ id: 'new-id', userId: 'u1', householdId: 'h1', kind: 'buy', name: 'used car', furthestStep: 1 });
    expect(call.inputs.emergency).toBe(false);
    expect(mockPush).toHaveBeenCalledWith('/decide/check/price?id=new-id');
  });

  it('goes to the answer for a small cash purchase and ignores a second tap while pending', async () => {
    const { result } = await renderHook(() => useNewCheck());
    await act(async () => {
      result.current.start(fields({ text: 'laptop', price: 350_000 }));
    });
    expect(mockPush).toHaveBeenCalledWith('/decide/answer/new-id');
    expect(result.current.pending).toBe(true);
    await act(async () => {
      result.current.start(fields({ text: 'laptop', price: 350_000 }));
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
