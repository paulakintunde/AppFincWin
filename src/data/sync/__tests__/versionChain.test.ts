import { wipeDeviceData } from '@/services/storage/wipe';
import { clearVersionChains, recordWrittenVersion, resolveExpectedVersion } from '../versionChain';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

describe('versionChain (CR-A02)', () => {
  beforeEach(() => clearVersionChains());

  it('returns the caller\'s expected version when nothing was written yet', () => {
    expect(resolveExpectedVersion('transactions', 'tx-1', 1)).toBe(1);
  });

  it('follows this device\'s own writes: base 1 -> 2 -> 3', () => {
    recordWrittenVersion('transactions', 'tx-1', [1, 1], 2);
    expect(resolveExpectedVersion('transactions', 'tx-1', 1)).toBe(2);
    recordWrittenVersion('transactions', 'tx-1', [1, 2], 3);
    expect(resolveExpectedVersion('transactions', 'tx-1', 1)).toBe(3);
    expect(resolveExpectedVersion('transactions', 'tx-1', 2)).toBe(3);
  });

  it('never maps an unknown base (a version this device did not write from)', () => {
    recordWrittenVersion('transactions', 'tx-1', [1], 2);
    expect(resolveExpectedVersion('transactions', 'tx-1', 5)).toBe(5);
  });

  it('keeps entities and ids apart', () => {
    recordWrittenVersion('transactions', 'x', [1], 2);
    expect(resolveExpectedVersion('accounts', 'x', 1)).toBe(1);
    expect(resolveExpectedVersion('transactions', 'y', 1)).toBe(1);
  });

  it('ignores a no-op write (same version back) and survives a malformed cycle', () => {
    recordWrittenVersion('accounts', 'a', [4], 4);
    expect(resolveExpectedVersion('accounts', 'a', 4)).toBe(4);
    recordWrittenVersion('accounts', 'b', [1], 2);
    recordWrittenVersion('accounts', 'b', [2], 1);
    expect([1, 2]).toContain(resolveExpectedVersion('accounts', 'b', 1));
  });

  it('is cleared by the sign-out wipe', async () => {
    recordWrittenVersion('custom_currencies', 'c', [1], 2);
    await wipeDeviceData();
    expect(resolveExpectedVersion('custom_currencies', 'c', 1)).toBe(1);
  });
});
