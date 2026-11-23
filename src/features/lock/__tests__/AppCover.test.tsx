import React from 'react';
import { AppState } from 'react-native';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { pageTint } from '@/theme/tokens';
import { DEFAULT_ACCENT } from '@/theme/accents';
import { AppCover } from '../AppCover';
import { useLockController } from '../useLockController';
import * as lockStore from '@/services/lock/lockStore';
import * as biometric from '@/services/lock/biometric';

jest.mock('@/services/lock/lockStore', () => ({
  ...jest.requireActual('@/services/lock/lockStore'),
  loadLockState: jest.fn(),
  markBackgrounded: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/services/lock/biometric', () => ({
  ...jest.requireActual('@/services/lock/biometric'),
  isBiometricPending: jest.fn(() => false),
}));

const load = lockStore.loadLockState as jest.Mock;
const mark = lockStore.markBackgrounded as jest.Mock;
const pending = biometric.isBiometricPending as jest.Mock;

const baseState = (over: Partial<lockStore.LockSettings> = {}, bg: number | null = null): lockStore.LockState => ({
  settings: { ...lockStore.DEFAULT_LOCK_SETTINGS, enabled: true, ...over },
  hasPin: false,
  wrongTries: 0,
  lockUntil: null,
  backgroundedAt: bg,
});

describe('AppCover', () => {
  it('renders nothing when not visible', async () => {
    const { queryByTestId } = await render(
      <ThemeProvider>
        <AppCover visible={false} />
      </ThemeProvider>
    );
    expect(queryByTestId('app-cover')).toBeNull();
  });

  it('fills with the page tint, shows the mark, and has no text at all', async () => {
    const { getByTestId, queryByTestId, toJSON } = await render(
      <ThemeProvider>
        <AppCover visible />
      </ThemeProvider>
    );
    const cover = getByTestId('app-cover', { includeHiddenElements: true });
    const style = Object.assign({}, ...[cover.props.style].flat(2).filter(Boolean));
    expect(style.backgroundColor).toBe(pageTint[DEFAULT_ACCENT]);
    expect(queryByTestId('brand-mark', { includeHiddenElements: true })).toBeTruthy();
    expect(JSON.stringify(toJSON())).not.toContain('"Text"');
  });
});

describe('useLockController', () => {
  let handler: (s: string) => void = () => undefined;
  const remove = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    pending.mockReturnValue(false);
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: (s: string) => void) => {
      handler = h;
      return { remove };
    }) as never);
  });

  it('treats the first load as a cold start and locks when the lock is on', async () => {
    load.mockResolvedValue(baseState());
    const { result } = await renderHook(() => useLockController());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.locked).toBe(true);
  });

  it('does not lock when the lock is off', async () => {
    load.mockResolvedValue(baseState({ enabled: false }));
    const { result } = await renderHook(() => useLockController());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.locked).toBe(false);
  });

  it('covers on background, marks once, and locks on return after the time', async () => {
    load.mockResolvedValue(baseState({ timing: 'now' }));
    const { result } = await renderHook(() => useLockController());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => result.current.unlock());
    expect(result.current.locked).toBe(false);
    await act(async () => handler('inactive'));
    await act(async () => handler('background'));
    expect(result.current.coverVisible).toBe(true);
    expect(mark).toHaveBeenCalledTimes(1);
    load.mockResolvedValue(baseState({ timing: 'now' }, Date.now() - 5));
    await act(async () => handler('active'));
    expect(result.current.coverVisible).toBe(false);
    await waitFor(() => expect(result.current.locked).toBe(true));
  });

  it('stays unlocked on return inside the chosen time', async () => {
    load.mockResolvedValue(baseState({ timing: 'fifteenMinutes' }));
    const { result } = await renderHook(() => useLockController());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => result.current.unlock());
    await act(async () => handler('background'));
    load.mockResolvedValue(baseState({ timing: 'fifteenMinutes' }, Date.now() - 1000));
    await act(async () => handler('active'));
    expect(result.current.coverVisible).toBe(false);
    expect(result.current.locked).toBe(false);
  });

  it('ignores AppState changes while the biometric prompt is open', async () => {
    load.mockResolvedValue(baseState({ timing: 'now' }));
    const { result } = await renderHook(() => useLockController());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => result.current.unlock());
    pending.mockReturnValue(true);
    await act(async () => handler('inactive'));
    expect(result.current.coverVisible).toBe(false);
    expect(mark).not.toHaveBeenCalled();
    pending.mockReturnValue(false);
    await act(async () => handler('active'));
    expect(result.current.locked).toBe(false);
  });

  it('removes its subscription on unmount', async () => {
    load.mockResolvedValue(baseState());
    const { unmount } = await renderHook(() => useLockController());
    await act(async () => unmount());
    expect(remove).toHaveBeenCalled();
  });
});
