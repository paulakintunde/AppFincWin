import { FX_MONITOR_SECRET_ENV, FX_MONITOR_SECRET_HEADER, isAuthorized, safeEqual } from './auth';

function env(values: Record<string, string>) {
  return (name: string) => values[name];
}

function headers(values: Record<string, string>) {
  return (name: string) => values[name] ?? null;
}

describe('fx-monitor auth (IN-B03: its own secret, not fx-sync\'s)', () => {
  it('uses its own env var and header names', () => {
    expect(FX_MONITOR_SECRET_ENV).toBe('FX_MONITOR_SECRET');
    expect(FX_MONITOR_SECRET_HEADER).toBe('x-fx-monitor-secret');
  });

  it('accepts the fx-monitor secret in the fx-monitor header', () => {
    expect(
      isAuthorized(env({ FX_MONITOR_SECRET: 'monitor-secret' }), headers({ 'x-fx-monitor-secret': 'monitor-secret' }))
    ).toBe(true);
  });

  it('rejects the fx-sync secret, even when it is sent in the fx-sync header', () => {
    expect(
      isAuthorized(
        env({ FX_MONITOR_SECRET: 'monitor-secret', FX_SYNC_SECRET: 'sync-secret' }),
        headers({ 'x-fx-sync-secret': 'sync-secret' })
      )
    ).toBe(false);
    expect(
      isAuthorized(
        env({ FX_MONITOR_SECRET: 'monitor-secret', FX_SYNC_SECRET: 'sync-secret' }),
        headers({ 'x-fx-monitor-secret': 'sync-secret' })
      )
    ).toBe(false);
  });

  it('rejects everything when FX_MONITOR_SECRET is not configured', () => {
    expect(isAuthorized(env({}), headers({ 'x-fx-monitor-secret': '' }))).toBe(false);
    expect(isAuthorized(env({ FX_SYNC_SECRET: 'sync-secret' }), headers({ 'x-fx-monitor-secret': 'sync-secret' }))).toBe(
      false
    );
  });

  it('rejects a missing header', () => {
    expect(isAuthorized(env({ FX_MONITOR_SECRET: 'monitor-secret' }), headers({}))).toBe(false);
  });

  it('safeEqual compares exactly', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
