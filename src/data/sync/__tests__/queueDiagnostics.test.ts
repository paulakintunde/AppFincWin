// 05.3-103: the diagnostic recorder logs only changes, and only keys/flags/counts/ages.
import { QueryClient } from '@tanstack/react-query';
import { WRITE_SCOPE } from '../../keys';
import { DIAG_TAG, queueHead, recordOnlineChange, resetQueueDiagnosticsForTests } from '../queueDiagnostics';

describe('queueHead', () => {
  it('is null for an empty cache', () => {
    expect(queueHead(new QueryClient())).toBeNull();
  });

  it('describes the oldest pending write without variables', () => {
    const qc = new QueryClient();
    const cache = qc.getMutationCache();
    const a = cache.build(qc, { mutationKey: ['tx', 'add'], scope: WRITE_SCOPE, mutationFn: () => new Promise(() => undefined) });
    const b = cache.build(qc, { mutationKey: ['acct', 'edit'], scope: WRITE_SCOPE, mutationFn: () => new Promise(() => undefined) });
    void a.execute({ amount: 99900, name: 'secret' }).catch(() => undefined);
    void b.execute({ amount: 5 }).catch(() => undefined);
    const head = queueHead(qc, Date.now() + 1000);
    expect(head).not.toBeNull();
    expect(head?.key).toBe('tx.add');
    expect(head?.status).toBe('pending');
    expect(typeof head?.isPaused).toBe('boolean');
    expect(head?.failureCount).toBe(0);
    expect(head?.ageMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(head)).not.toMatch(/secret|99900/);
  });
});

describe('recordOnlineChange', () => {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    resetQueueDiagnosticsForTests();
    spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => spy.mockRestore());

  it('logs one line per change and nothing for repeats', () => {
    recordOnlineChange('netinfo', { isConnected: true, isInternetReachable: false }, null);
    recordOnlineChange('netinfo', { isConnected: false, isInternetReachable: false }, null);
    expect(spy).toHaveBeenCalledTimes(1);
    const [tag, json] = spy.mock.calls[0] as [string, string];
    expect(tag).toBe(DIAG_TAG);
    expect(JSON.parse(json)).toEqual({
      source: 'netinfo',
      online: false,
      isConnected: true,
      isInternetReachable: false,
      head: null,
    });
    recordOnlineChange('focus', { isConnected: true, isInternetReachable: true }, null);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
