import { renderHook, act } from '@testing-library/react-native';
import { EMPTY_FILTER } from '@/engine/activity';
import { wipeDeviceData } from '@/services/storage/wipe';
import {
  useSelectedMonth,
  setSelectedMonth,
  getSelectedMonth,
  requestActivityFocus,
  useActivityFilterIntent,
  consumeActivityFilterIntent,
  resetActivityFocusForTests,
} from '../activityFocus';

const UNPAID = { ...EMPTY_FILTER, unpaidOnly: true };

describe('activityFocus', () => {
  beforeEach(() => resetActivityFocusForTests());

  it('falls back until a month is stored, then every subscriber follows', async () => {
    const a = await renderHook(() => useSelectedMonth('2026-10'));
    const b = await renderHook(() => useSelectedMonth('2026-10'));
    expect(a.result.current[0]).toBe('2026-10');
    await act(async () => setSelectedMonth('2026-09'));
    expect(a.result.current[0]).toBe('2026-09');
    expect(b.result.current[0]).toBe('2026-09');
    await act(async () => b.result.current[1]('2026-08'));
    expect(a.result.current[0]).toBe('2026-08');
  });

  it('requestActivityFocus sets the month and exposes the intent once', async () => {
    const month = await renderHook(() => useSelectedMonth('2026-10'));
    const intent = await renderHook(() => useActivityFilterIntent());
    await act(async () => requestActivityFocus({ month: '2026-09', filter: UNPAID }));
    expect(month.result.current[0]).toBe('2026-09');
    expect(intent.result.current).toEqual(UNPAID);
    let taken: unknown;
    await act(async () => {
      taken = consumeActivityFilterIntent();
    });
    expect(taken).toEqual(UNPAID);
    expect(intent.result.current).toBeNull();
    expect(consumeActivityFilterIntent()).toBeNull();
  });

  it('a second request replaces an unconsumed intent', async () => {
    const other = { ...EMPTY_FILTER, unpaidOnly: false };
    await act(async () => requestActivityFocus({ month: '2026-09', filter: UNPAID }));
    await act(async () => requestActivityFocus({ month: '2026-08', filter: other }));
    expect(getSelectedMonth()).toBe('2026-08');
    expect(consumeActivityFilterIntent()).toEqual(other);
  });

  it('the wipe handler clears month and intent', async () => {
    await act(async () => requestActivityFocus({ month: '2026-09', filter: UNPAID }));
    await act(async () => {
      await wipeDeviceData();
    });
    expect(getSelectedMonth()).toBeNull();
    expect(consumeActivityFilterIntent()).toBeNull();
  });

  it('a pick made in October is dropped once the fallback rolls to November', async () => {
    const hook = await renderHook(({ fb }: { fb: string }) => useSelectedMonth(fb), { initialProps: { fb: '2026-10' } });
    await act(async () => hook.result.current[1]('2026-08'));
    expect(hook.result.current[0]).toBe('2026-08');
    await hook.rerender({ fb: '2026-11' });
    expect(hook.result.current[0]).toBe('2026-11');
    expect(getSelectedMonth()).toBeNull();
  });

  it('a requested month survives rerenders with an unchanged fallback', async () => {
    const hook = await renderHook(({ fb }: { fb: string }) => useSelectedMonth(fb), { initialProps: { fb: '2026-10' } });
    await act(async () => requestActivityFocus({ month: '2026-09', filter: UNPAID }));
    expect(hook.result.current[0]).toBe('2026-09');
    await hook.rerender({ fb: '2026-10' });
    expect(hook.result.current[0]).toBe('2026-09');
  });

  it('a pick made after the rollover survives rerenders', async () => {
    const hook = await renderHook(({ fb }: { fb: string }) => useSelectedMonth(fb), { initialProps: { fb: '2026-11' } });
    await act(async () => hook.result.current[1]('2026-09'));
    await hook.rerender({ fb: '2026-11' });
    expect(hook.result.current[0]).toBe('2026-09');
  });

  it('the wipe handler also resets the anchor so a later pick is not mis-dropped', async () => {
    const hook = await renderHook(({ fb }: { fb: string }) => useSelectedMonth(fb), { initialProps: { fb: '2026-10' } });
    await act(async () => hook.result.current[1]('2026-08'));
    await act(async () => {
      await wipeDeviceData();
    });
    expect(getSelectedMonth()).toBeNull();
    await act(async () => hook.result.current[1]('2026-07'));
    await hook.rerender({ fb: '2026-10' });
    expect(hook.result.current[0]).toBe('2026-07');
  });
});
