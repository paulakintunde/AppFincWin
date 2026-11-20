import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { mayPublish, PUBLISH_EVERY_MS, roundDownToStep, usePublishPartnerFigure } from '../usePublishPartnerFigure';

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/data/queries/household', () => ({ useHouseholdId: () => ({ data: 'h' }) }));

let mockOptins: { owner_id: string; enabled: boolean }[] = [];
let mockShares: { goal_id: string; enabled: boolean }[] = [];
jest.mock('@/data/queries/partnerMoney', () => ({ usePartnerOptins: () => ({ data: mockOptins }), useOwnNetShares: () => ({ data: mockShares }) }));

jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => mockDecide }));
let mockDecide: { prepared: { inputs: { currency: string; safetyNet?: { saved: number } } } } = { prepared: { inputs: { currency: 'USD' } } };
let mockLeft = 123456;
jest.mock('@/engine/month', () => ({ monthPicture: () => ({ leftAfterPlans: mockLeft }) }));

const mockPublish = jest.fn(async (..._a: unknown[]): Promise<{ ok: boolean }> => ({ ok: true }));
const mockPublishNet = jest.fn(async (..._a: unknown[]): Promise<{ ok: boolean }> => ({ ok: true }));
jest.mock('@/db/partnerOptins', () => ({ publishPartnerFigure: (...a: unknown[]) => mockPublish(...a), publishSafetyNetSaved: (...a: unknown[]) => mockPublishNet(...a) }));

beforeEach(() => {
  mockPublish.mockClear();
  mockPublishNet.mockClear();
  mockShares = [];
  mockDecide = { prepared: { inputs: { currency: 'USD' } } };
  mockOptins = [];
  mockLeft = 123456;
  jest.useFakeTimers({ now: new Date('2026-11-18T10:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
});
afterEach(() => jest.useRealTimers());

describe('roundDownToStep and mayPublish', () => {
  it('rounds down to a multiple of 1000 minor units', () => {
    expect(roundDownToStep(123456)).toBe(123000);
    expect(roundDownToStep(999)).toBe(0);
    expect(roundDownToStep(1000)).toBe(1000);
    expect(roundDownToStep(-1)).toBe(-1000);
    expect(Object.is(roundDownToStep(-0), -0)).toBe(false);
  });

  it('allows a publish only with an opt-in and an hour since the last', () => {
    expect(mayPublish(false, 10 * PUBLISH_EVERY_MS, null)).toBe(false);
    expect(mayPublish(true, 0, null)).toBe(true);
    expect(mayPublish(true, PUBLISH_EVERY_MS - 1, 0)).toBe(false);
    expect(mayPublish(true, PUBLISH_EVERY_MS, 0)).toBe(true);
  });
});

describe('usePublishPartnerFigure', () => {
  it('publishes nothing without an enabled opt-in of the viewer', async () => {
    mockOptins = [
      { owner_id: 'me', enabled: false },
      { owner_id: 'u2', enabled: true },
    ];
    await renderHook(() => usePublishPartnerFigure());
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('publishes one total rounded down, with the currency, never anything else', async () => {
    mockOptins = [{ owner_id: 'me', enabled: true }];
    await renderHook(() => usePublishPartnerFigure());
    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledWith({}, 123000, 'USD');
  });

  it('publishes at most once an hour when the app returns to the front', async () => {
    mockOptins = [{ owner_id: 'me', enabled: true }];
    let handler: (s: string) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: (s: string) => void) => {
      handler = h;
      return { remove: jest.fn() };
    }) as never);
    await renderHook(() => usePublishPartnerFigure());
    expect(mockPublish).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(30 * 60 * 1000);
      handler('active');
    });
    expect(mockPublish).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(31 * 60 * 1000);
      handler('active');
    });
    expect(mockPublish).toHaveBeenCalledTimes(2);
  });

  it('08.1-10: publishes the shared safety net saved amount, rounded down, with no opt-in needed', async () => {
    mockShares = [{ goal_id: 'g1', enabled: true }, { goal_id: 'g2', enabled: false }];
    mockDecide = { prepared: { inputs: { currency: 'USD', safetyNet: { saved: 456789 } } } };
    await renderHook(() => usePublishPartnerFigure());
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockPublishNet).toHaveBeenCalledTimes(1);
    expect(mockPublishNet).toHaveBeenCalledWith({}, 'g1', 456000);
  });

  it('08.1-10: sends nothing for a shared net when no safety net is saved in the inputs', async () => {
    mockShares = [{ goal_id: 'g1', enabled: true }];
    await renderHook(() => usePublishPartnerFigure());
    expect(mockPublishNet).not.toHaveBeenCalled();
  });
});
