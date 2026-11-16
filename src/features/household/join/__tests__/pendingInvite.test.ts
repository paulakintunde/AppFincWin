import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PENDING_INVITE_KEY,
  PENDING_INVITE_MAX_AGE_MS,
  formatTypedCode,
  peekPendingInvite,
  savePendingInvite,
  takePendingInvite,
} from '../pendingInvite';

jest.mock('@/services/storage/wipe', () => {
  const handlers: { id: string; wipe: () => Promise<void> }[] = [];
  return {
    registerWipeHandler: (h: { id: string; wipe: () => Promise<void> }) => {
      handlers.push(h);
      return () => undefined;
    },
    __handlers: handlers,
  };
});

const CODE = 'A7K2-M9Q3-X4W5';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('pendingInvite', () => {
  it('does not store a code that is not 12 valid characters', async () => {
    expect(await savePendingInvite('hello')).toBe(false);
    expect(await savePendingInvite('A7K2-M9Q3')).toBe(false);
    expect(await savePendingInvite('A7K2-M9Q3-X4W5-ZZZZ')).toBe(false);
    expect(await savePendingInvite('UUUU-UUUU-UUUU')).toBe(false);
    expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
  });

  it('stores a valid code in its grouped form and peek leaves it in place', async () => {
    expect(await savePendingInvite('a7k2m9q3x4w5')).toBe(true);
    expect(await peekPendingInvite()).toBe(CODE);
    expect(await peekPendingInvite()).toBe(CODE);
  });

  it('take returns the code once and clears it', async () => {
    await savePendingInvite(CODE);
    expect(await takePendingInvite()).toBe(CODE);
    expect(await takePendingInvite()).toBeNull();
    expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
  });

  it('ignores an entry older than 7 days and clears it', async () => {
    const saved = Date.now();
    await savePendingInvite(CODE, saved);
    const eightDays = saved + 8 * 24 * 60 * 60 * 1000;
    expect(await peekPendingInvite(eightDays)).toBeNull();
    expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
  });

  it('keeps an entry just inside the 7 days', async () => {
    const saved = Date.now();
    await savePendingInvite(CODE, saved);
    expect(await peekPendingInvite(saved + PENDING_INVITE_MAX_AGE_MS - 1)).toBe(CODE);
  });

  it('treats a damaged entry as nothing', async () => {
    await AsyncStorage.setItem(PENDING_INVITE_KEY, '{not json');
    expect(await peekPendingInvite()).toBeNull();
  });

  it('is cleared when the app wipes its data on sign-out', async () => {
    await savePendingInvite(CODE);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const handlers = (require('@/services/storage/wipe') as { __handlers: { id: string; wipe: () => Promise<void> }[] }).__handlers;
    const handler = handlers.find((h) => h.id === 'household-pending-invite');
    expect(handler).toBeTruthy();
    await handler!.wipe();
    expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
  });

  it('groups what is typed or pasted as XXXX-XXXX-XXXX and reads O as 0 and I or L as 1', () => {
    expect(formatTypedCode('a7k2')).toBe('A7K2');
    expect(formatTypedCode('a7k2m')).toBe('A7K2-M');
    expect(formatTypedCode(' a7k2 m9q3 x4w5 ')).toBe(CODE);
    expect(formatTypedCode('a7k2-m9q3-x4w5-extra')).toBe(CODE);
    expect(formatTypedCode('OIL0')).toBe('0110');
  });
});
