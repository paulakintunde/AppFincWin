import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { mayPublish, personalPrepared, PUBLISH_EVERY_MS, roundDownToStep, usePublishPartnerFigure } from '../usePublishPartnerFigure';

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/data/queries/household', () => ({ useHouseholdId: () => ({ data: 'h' }) }));

let mockOptins: { owner_id: string; enabled: boolean }[] = [];
let mockShares: { goal_id: string; enabled: boolean }[] = [];
jest.mock('@/data/queries/partnerMoney', () => ({ usePartnerOptins: () => ({ data: mockOptins }), useOwnNetShares: () => ({ data: mockShares }) }));

jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => mockDecide }));
let mockDecide: { prepared: { inputs: { currency: string; safetyNet?: { saved: number } } } } = { prepared: { inputs: { currency: 'USD' } } };
let mockLeft = 123456;
jest.mock('@/engine/month', () => ({ monthPicture: (p: { left?: number }) => ({ leftAfterPlans: p.left ?? mockLeft }) }));
// 08.1-22: the household and joint reads are mocked (never a live client); the builder and prepare are stood in for.
let mockScope: { source: unknown; pending: boolean } = { source: undefined, pending: false };
jest.mock('../useHouseholdScopeSource', () => ({ useHouseholdScopeSource: () => mockScope }));
const mockBuild = jest.fn((..._a: unknown[]) => ({ built: true }));
jest.mock('@/features/decide/snapshot/v3/buildInputs', () => ({ buildInputs: (...a: unknown[]) => mockBuild(...a) }));
const mockApply = jest.fn((..._a: unknown[]) => ({ personal: true }));
const mockPrepare = jest.fn((..._a: unknown[]) => ({ left: 77_000, inputs: { currency: 'USD' } }));
jest.mock('@/engine/decide/v3', () => ({ applyJointMoney: (...a: unknown[]) => mockApply(...a), prepare: (...a: unknown[]) => mockPrepare(...a) }));

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
  mockScope = { source: undefined, pending: false };
  mockBuild.mockClear();
  mockApply.mockClear();
  mockPrepare.mockClear();
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

describe('08.1-22 the published figure is personal money only', () => {
  const prepared = (jointBack?: unknown) => ({ left: 5, inputs: { currency: 'USD', household: jointBack === undefined ? undefined : { jointBack } } }) as never;
  it('personalPrepared is the same Prepared when no joint money was laid in', () => {
    const p = prepared();
    expect(personalPrepared(p)).toBe(p);
    expect(mockPrepare).not.toHaveBeenCalled();
  });
  it('personalPrepared takes the joint slice back out and prepares again', () => {
    const back = { monthDelta: -1, cashDelta: -2, balances: {} };
    expect(personalPrepared(prepared(back))).toEqual({ left: 77_000, inputs: { currency: 'USD' } });
    expect(mockApply).toHaveBeenCalledWith(expect.objectContaining({ currency: 'USD' }), back);
  });
  it('with a household source the hook builds the inputs with the joint slice, then publishes the personal figure', async () => {
    mockOptins = [{ owner_id: 'me', enabled: true }];
    mockDecide = { prepared: { inputs: { currency: 'USD' } }, source: { today: 'x' }, v3: null } as never;
    mockScope = { source: { scope: 'me' }, pending: false };
    mockPrepare.mockReturnValue({ left: 88_500, inputs: { currency: 'USD', household: { jointBack: { monthDelta: 0, cashDelta: 0, balances: {} } } } } as never);
    mockApply.mockReturnValue({ personal: true });
    await act(async () => {
      renderHook(() => usePublishPartnerFigure());
    });
    expect(mockBuild).toHaveBeenCalledWith({ today: 'x', household: { scope: 'me' } }, null);
    expect(mockPublish).toHaveBeenCalledWith(expect.anything(), 88_000, 'USD');
  });
  it('publishes nothing while the household reads are still loading', async () => {
    mockOptins = [{ owner_id: 'me', enabled: true }];
    mockScope = { source: undefined, pending: true };
    await act(async () => {
      renderHook(() => usePublishPartnerFigure());
    });
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
