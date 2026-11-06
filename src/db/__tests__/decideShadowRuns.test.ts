import { insertShadowRuns, type ShadowRunRow } from '../decideShadowRuns';
import { fetchRegionSubdivision, updateRegionSubdivision } from '../profile';
import { createFakeSupabase } from './fakeSupabase';

const row: ShadowRunRow = {
  user_id: 'u1',
  engine_revision: 'r1',
  sample_id: 's60',
  code: 'fits_month',
  variant: null,
  reasons: [],
  figures: { left: 1200 },
};

describe('insertShadowRuns', () => {
  it('inserts without reading anything back', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 201 });
    await insertShadowRuns(client, [row]);
    const methods = client.calls.map((c) => c.method);
    expect(methods).toContain('insert');
    expect(methods).not.toContain('select');
    expect(client.calls.find((c) => c.method === 'insert')?.table).toBe('decide_shadow_runs');
  });

  it('does nothing for an empty list', async () => {
    const client = createFakeSupabase();
    await insertShadowRuns(client, []);
    expect(client.calls).toHaveLength(0);
  });

  it('treats a unique violation as already sent', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    await expect(insertShadowRuns(client, [row])).resolves.toBeUndefined();
  });

  it('throws any other error', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'no', code: '42501' }, status: 403 });
    await expect(insertShadowRuns(client, [row])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('region subdivision', () => {
  it('reads the value, or null', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { region_subdivision: 'ON' }, error: null, status: 200 });
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchRegionSubdivision(client, 'u1')).resolves.toBe('ON');
    await expect(fetchRegionSubdivision(client, 'u1')).resolves.toBeNull();
  });

  it('writes only a short upper-case code or null', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 204 });
    await updateRegionSubdivision(client, 'u1', 'NSW');
    expect(client.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ region_subdivision: 'NSW' });
    await expect(updateRegionSubdivision(client, 'u1', 'california')).rejects.toBeInstanceOf(TypeError);
  });

  it('surfaces a write error', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'x', code: '42501' }, status: 403 });
    await expect(updateRegionSubdivision(client, 'u1', null)).rejects.toMatchObject({ code: '42501' });
  });
});
