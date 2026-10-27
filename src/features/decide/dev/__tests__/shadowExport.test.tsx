import { render } from '@testing-library/react-native';
import { DevSettings } from 'react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { SnapshotSource } from '../../snapshot/buildSnapshot';
import { ShadowExportDevMenu, resetDevMenuRegistration } from '../ShadowExportDevMenu';
import { parseShadowSource, serializeShadowSource } from '../shadowExport';

jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { document: 'doc' } }));
jest.mock('@/data/queries/decide', () => ({
  useDecideChecks: () => ({ data: [] }),
  useDecideSnapshot: () => ({ source: null }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u', householdId: 'h', today: '2026-10-01' }),
}));

const source = { today: '2026-10-01', homeCurrency: 'USD' } as unknown as SnapshotSource;
const row = (over: Partial<DecideCheckRow>): DecideCheckRow =>
  ({
    id: 'c1',
    household_id: 'h1',
    created_by: 'user-secret',
    kind: 'buy',
    name: 'Sofa',
    inputs: { v: 2, price: 100 },
    status: 'open',
    last_seen_state: 'fits',
    last_seen_basis: 'logged_months',
    deleted_at: null,
    ...over,
  }) as DecideCheckRow;

describe('shadowExport', () => {
  it('round-trips and carries only the household source and its checks', () => {
    const text = serializeShadowSource({
      source,
      v3Settings: null,
      householdId: 'h1',
      today: '2026-10-01',
      checks: [row({}), row({ id: 'c2', household_id: 'other' }), row({ id: 'c3', deleted_at: 'x' })],
    });
    const parsed = parseShadowSource(text);
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed!).sort()).toEqual(['checks', 'format', 'householdId', 'source', 'today', 'v3Settings', 'version']);
    expect(parsed!.format).toBe('fincwin-shadow-source');
    expect(parsed!.checks).toHaveLength(1);
    expect(Object.keys(parsed!.checks[0]!).sort()).toEqual(['id', 'inputs', 'kind', 'last_seen_state', 'name', 'status']);
    expect(text).not.toContain('user-secret');
  });

  it('rejects other formats without throwing', () => {
    expect(parseShadowSource('not json')).toBeNull();
    expect(parseShadowSource('{"format":"other","version":1}')).toBeNull();
    expect(parseShadowSource('null')).toBeNull();
    expect(parseShadowSource('{"format":"fincwin-shadow-source","version":2}')).toBeNull();
  });
});

describe('ShadowExportDevMenu', () => {
  const g = globalThis as unknown as { __DEV__: boolean };
  const original = g.__DEV__;
  beforeEach(() => resetDevMenuRegistration());
  afterEach(() => {
    g.__DEV__ = original;
    jest.restoreAllMocks();
  });

  it("renders null and registers nothing when __DEV__ is false", async () => {
    g.__DEV__ = false;
    const add = jest.spyOn(DevSettings, 'addMenuItem').mockImplementation(() => undefined);
    const view = await render(<ShadowExportDevMenu />);
    expect(view.toJSON()).toBeNull();
    expect(add).not.toHaveBeenCalled();
  });

  it("registers one menu item in a dev build", async () => {
    g.__DEV__ = true;
    const add = jest.spyOn(DevSettings, 'addMenuItem').mockImplementation(() => undefined);
    await render(<ShadowExportDevMenu />);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('L-08: mounting twice registers the menu item once, and the handler logs when the snapshot is not ready', async () => {
    g.__DEV__ = true;
    const add = jest.spyOn(DevSettings, 'addMenuItem').mockImplementation(() => undefined);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const first = await render(<ShadowExportDevMenu />);
    await first.unmount();
    await render(<ShadowExportDevMenu />);
    expect(add).toHaveBeenCalledTimes(1);
    const handler = add.mock.calls[0]![1] as () => void;
    handler();
    expect(log).toHaveBeenCalledWith('Decide shadow export: the snapshot is not ready yet');
  });
});
