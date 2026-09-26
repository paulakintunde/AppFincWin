// FND-09: proves compareVersions/isBelowMinimum's numeric comparison, fetchMinSupportedVersion's
// fail-open behaviour (error, thrown exception, timeout all resolve to null), and
// useMinVersionGate's status transitions.
import { renderHook, waitFor } from '@testing-library/react-native';
import { compareVersions, isBelowMinimum, fetchMinSupportedVersion, type MinVersionClient } from '../minVersion';
import * as minVersionModule from '../minVersion';
import { useMinVersionGate } from '../useMinVersionGate';

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '0.2.0',
}));

function fakeClient(
  maybeSingle: () => PromiseLike<{ data: { value: string } | null; error: { message: string } | null }>
): MinVersionClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle,
        }),
      }),
    }),
  };
}

describe('compareVersions', () => {
  it('is 0 for equal versions', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
  });

  it('is negative when a < b', () => {
    expect(compareVersions('0.1.0', '0.2.0')).toBeLessThan(0);
  });

  it('is positive when a > b, including double-digit segments', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
  });

  it('treats a missing patch segment as 0', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });

  it('throws on a non-numeric segment', () => {
    expect(() => compareVersions('1.x.0', '1.0.0')).toThrow();
  });
});

describe('isBelowMinimum', () => {
  it('is true when current is below min', () => {
    expect(isBelowMinimum('0.1.0', '0.2.0')).toBe(true);
  });

  it('is false when current equals min', () => {
    expect(isBelowMinimum('0.2.0', '0.2.0')).toBe(false);
  });
});

describe('fetchMinSupportedVersion', () => {
  it('resolves the value on a successful query', async () => {
    const client = fakeClient(() => Promise.resolve({ data: { value: '0.3.0' }, error: null }));
    await expect(fetchMinSupportedVersion(client)).resolves.toBe('0.3.0');
  });

  it('resolves null (fail open) when the query returns an error', async () => {
    const client = fakeClient(() => Promise.resolve({ data: null, error: { message: 'denied' } }));
    await expect(fetchMinSupportedVersion(client)).resolves.toBeNull();
  });

  it('resolves null (fail open) when the query throws', async () => {
    const client = fakeClient(() => Promise.reject(new TypeError('Network request failed')));
    await expect(fetchMinSupportedVersion(client)).resolves.toBeNull();
  });

  it('resolves null (fail open) when the query exceeds the timeout', async () => {
    const client = fakeClient(() => new Promise(() => {})); // never resolves
    await expect(fetchMinSupportedVersion(client, 20)).resolves.toBeNull();
  });
});

describe('useMinVersionGate', () => {
  let fetchSpy: jest.SpiedFunction<typeof minVersionModule.fetchMinSupportedVersion>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(minVersionModule, 'fetchMinSupportedVersion');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('yields checking then ok when the server reports no minimum', async () => {
    fetchSpy.mockResolvedValue(null);

    const { result } = await renderHook(() => useMinVersionGate());

    await waitFor(() => expect(result.current.status).toBe('ok'));
  });

  it('yields ok when the installed version already meets the minimum', async () => {
    fetchSpy.mockResolvedValue('0.2.0');

    const { result } = await renderHook(() => useMinVersionGate());

    await waitFor(() => expect(result.current.status).toBe('ok'));
  });

  it('yields blocked with the minimum version when the installed version is below it', async () => {
    fetchSpy.mockResolvedValue('0.3.0');

    const { result } = await renderHook(() => useMinVersionGate());

    await waitFor(() => expect(result.current.status).toBe('blocked'));
    expect(result.current.minVersion).toBe('0.3.0');
  });
});
