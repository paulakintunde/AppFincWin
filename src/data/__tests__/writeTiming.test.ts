// F-2 (06.1-48): every write leaves a Sentry breadcrumb with its time to settle, so a device check can tell app delay
// from network delay. Only the mutation key name, ms, status and failure count: never variables, amounts or ids.
import { addBreadcrumb } from '@sentry/react-native';
import { queryClient } from '../queryClient';

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn() }));

const writeCrumbs = () =>
  (addBreadcrumb as jest.Mock).mock.calls
    .map((c) => c[0] as { category: string; message: string; data: Record<string, unknown> })
    .filter((b) => b.category === 'write' && b.message === 'settled');
const startCrumbs = () =>
  (addBreadcrumb as jest.Mock).mock.calls
    .map((c) => c[0] as { category: string; message: string; data: Record<string, unknown> })
    .filter((b) => b.category === 'write' && b.message === 'start');

describe('F-2 write timing breadcrumbs', () => {
  afterEach(() => {
    (addBreadcrumb as jest.Mock).mockClear();
    queryClient.getMutationCache().clear();
  });

  it('a settled write adds one write breadcrumb with numeric ms and no payload', async () => {
    const m = queryClient.getMutationCache().build(queryClient, {
      mutationKey: ['transactions', 'add'],
      mutationFn: async () => 'ok',
    });
    await m.execute({ row: { id: 'secret-id', amount: 1234 }, body: 'x' });
    const crumbs = writeCrumbs();
    expect(crumbs).toHaveLength(1);
    const crumb = crumbs[0]!;
    expect(crumb.message).toBe('settled');
    expect(crumb.data.key).toBe('transactions');
    expect(crumb.data.status).toBe('success');
    expect(typeof crumb.data.ms).toBe('number');
    expect(crumb.data.ms as number).toBeGreaterThanOrEqual(0);
    expect(typeof crumb.data.failures).toBe('number');
    for (const banned of ['variables', 'amount', 'body']) expect(crumb.data).not.toHaveProperty(banned);
    expect(JSON.stringify(crumb)).not.toContain('secret-id');
    expect(JSON.stringify(crumb)).not.toContain('1234');
  });

  it('a failed write is recorded as error', async () => {
    const m = queryClient.getMutationCache().build(queryClient, {
      mutationKey: ['accounts', 'edit'],
      mutationFn: async () => {
        throw new Error('nope');
      },
    });
    await m.execute({}).catch(() => undefined);
    const crumbs = writeCrumbs();
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0]!.data).toMatchObject({ key: 'accounts', status: 'error' });
  });

  it('a write with no key is recorded as unknown', async () => {
    const m = queryClient.getMutationCache().build(queryClient, { mutationFn: async () => 1 });
    await m.execute(undefined);
    expect(writeCrumbs()[0]!.data.key).toBe('unknown');
  });

  it('06.1-73: each write adds one start crumb with the key name and the pending count only', async () => {
    const m = queryClient.getMutationCache().build(queryClient, {
      mutationKey: ['decide-checks', 'save'],
      mutationFn: async () => 'ok',
    });
    await m.execute({ id: 'secret-id', price: 98765 });
    const crumbs = startCrumbs();
    expect(crumbs).toHaveLength(1);
    expect(Object.keys(crumbs[0]!.data).sort()).toEqual(['key', 'pending']);
    expect(crumbs[0]!.data.key).toBe('decide-checks');
    expect(typeof crumbs[0]!.data.pending).toBe('number');
    expect(JSON.stringify(crumbs[0])).not.toContain('secret-id');
    expect(JSON.stringify(crumbs[0])).not.toContain('98765');
  });

  it('06.1-73: a throwing breadcrumb never fails the write', async () => {
    (addBreadcrumb as jest.Mock).mockImplementationOnce(() => {
      throw new Error('sentry down');
    });
    const m = queryClient.getMutationCache().build(queryClient, { mutationKey: ['x'], mutationFn: async () => 7 });
    await expect(m.execute(undefined)).resolves.toBe(7);
  });
});
