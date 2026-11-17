import { requestAccountDeletion } from '../deleteAccount';

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
    ...over,
  };
  return { d, order };
}

describe('requestAccountDeletion', () => {
  it('wipes the device only after the server confirms, then signs out', async () => {
    const { d, order } = deps();
    await expect(requestAccountDeletion(d)).resolves.toEqual({ ok: true });
    expect(order).toEqual(['invoke', 'signOut', 'wipe']);
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
});
