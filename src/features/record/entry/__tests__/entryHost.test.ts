import { renderHook, act } from '@testing-library/react-native';
import { wipeDeviceData } from '@/services/storage/wipe';
import { openEntry, closeEntry, useEntryHostMode, resetEntryHostForTests } from '../entryHost';

describe('entryHost', () => {
  beforeEach(() => resetEntryHostForTests());

  it('opens, replaces and closes the mode', async () => {
    const { result } = await renderHook(() => useEntryHostMode());
    expect(result.current).toBeNull();
    await act(async () => openEntry({ kind: 'new', direction: 'out' }));
    expect(result.current).toEqual({ kind: 'new', direction: 'out' });
    await act(async () => openEntry({ kind: 'new', direction: 'in' }));
    expect(result.current).toEqual({ kind: 'new', direction: 'in' });
    await act(async () => closeEntry());
    expect(result.current).toBeNull();
  });

  it('the wipe handler closes the host', async () => {
    const { result } = await renderHook(() => useEntryHostMode());
    await act(async () => openEntry({ kind: 'new', direction: 'out' }));
    await act(async () => {
      await wipeDeviceData();
    });
    expect(result.current).toBeNull();
  });
});
