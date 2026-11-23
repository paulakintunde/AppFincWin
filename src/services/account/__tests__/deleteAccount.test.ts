import { requestAccountDeletion } from '../deleteAccount';
import { consumeSignOutReason } from '@/features/auth/signOutReason';

function deps(over: Record<string, unknown> = {}) {
  const order: string[] = [];
  const d = {
    isOnline: () => true,
    invoke: jest.fn(async () => {
      order.push('invoke');
      return { data: { ok: true }, error: null };
    }),
    wipeDeviceData: jest.fn(async () => {
      order.push('wipe');
    }),
    signOut: jest.fn(async (o?: { wipeDeviceData?: () => Promise<void> }) => {
      order.push('signOut');
      await o?.wipeDeviceData?.();
    }),
    resetTheme: jest.fn(),
    getEmail: jest.fn(async () => {
      order.push('getEmail');
      return 'a@b.co';
    }),
    forgetGoogle: jest.fn(async () => {
      order.push('forgetGoogle');
    }),
    ...over,
  };
  return { d, order };
}

describe('requestAccountDeletion', () => {
  it('wipes the device only after the server confirms, then signs out', async () => {
    const { d, order } = deps();
    await expect(requestAccountDeletion(d)).resolves.toEqual({ ok: true });
    expect(order).toEqual(['getEmail', 'invoke', 'forgetGoogle', 'signOut', 'wipe']);
    expect(d.forgetGoogle).toHaveBeenCalledWith('a@b.co');
    expect(consumeSignOutReason()).toBe('deleted');
    expect(d.resetTheme).not.toHaveBeenCalled(); // handed to the sign-out completion, which runs it
  });

  it('does nothing when offline', async () => {
    const { d } = deps({ isOnline: () => false });
    await expect(requestAccountDeletion(d)).resolves.toEqual({ ok: false, reason: 'offline' });
    expect(d.invoke).not.toHaveBeenCalled();
    expect(d.wipeDeviceData).not.toHaveBeenCalled();
  });

  it('leaves the account and device untouched when the function answers an error', async () => {
    const { d } = deps({ invoke: jest.fn(async () => ({ data: null, error: new Error('500') })) });
    await expect(requestAccountDeletion(d)).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(d.wipeDeviceData).not.toHaveBeenCalled();
    expect(d.signOut).not.toHaveBeenCalled();
  });

  it('treats an ok:false body as a failure', async () => {
    const { d } = deps({ invoke: jest.fn(async () => ({ data: { ok: false }, error: null })) });
    await expect(requestAccountDeletion(d)).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(d.wipeDeviceData).not.toHaveBeenCalled();
  });

  it('treats a thrown invoke as a failure', async () => {
    const { d } = deps({ invoke: jest.fn(async () => { throw new Error('network'); }) });
    await expect(requestAccountDeletion(d)).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(d.wipeDeviceData).not.toHaveBeenCalled();
  });

  it('does not call getEmail, invoke or forgetGoogle when offline', async () => {
    const { d } = deps({ isOnline: () => false });
    await requestAccountDeletion(d);
    expect(d.getEmail).not.toHaveBeenCalled();
    expect(d.forgetGoogle).not.toHaveBeenCalled();
    expect(d.signOut).not.toHaveBeenCalled();
  });

  it('does not forget Google on a server failure', async () => {
    const { d } = deps({ invoke: jest.fn(async () => ({ data: null, error: new Error('500') })) });
    await requestAccountDeletion(d);
    expect(d.forgetGoogle).not.toHaveBeenCalled();
  });

  it('skips forgetGoogle without an email but still wipes', async () => {
    const { d } = deps({ getEmail: jest.fn(async () => null) });
    await expect(requestAccountDeletion(d)).resolves.toEqual({ ok: true });
    expect(d.forgetGoogle).not.toHaveBeenCalled();
    expect(d.wipeDeviceData).toHaveBeenCalled();
  });

  it('still wipes when forgetGoogle rejects', async () => {
    const { d } = deps({ forgetGoogle: jest.fn(async () => { throw new Error('x'); }) });
    await expect(requestAccountDeletion(d)).resolves.toEqual({ ok: true });
    expect(d.wipeDeviceData).toHaveBeenCalled();
  });
});
