import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { AccountUseStep } from '../steps/AccountUseStep';
import type { SetupStepReady } from '../steps/types';

// 06.1-41: the suggestion-rule and account-list cases moved to src/features/record/accounts/__tests__/accountUse.test.tsx.
// Only the old setup step's cases stay here; plan 06.1-36 deletes this file with the setup folder.
let mockDecideV3 = true;
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockDecideV3 }) }));
jest.setTimeout(30000);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const mockSaveOne = jest.fn((_i: Record<string, unknown>) => ({ stepId: 'step-one' }));
const mockSaveMany = jest.fn((_i: unknown) => ({ stepId: 'step-many' }));
const mockToast = jest.fn();
jest.mock('@/data/mutations/accountUse', () => ({
  useSaveAccountUse: () => ({ save: (i: Record<string, unknown>) => mockSaveOne(i) }),
  useSaveAccountUses: () => ({ save: (i: unknown) => mockSaveMany(i) }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));

const acct = (id: string, name: string, kind: string, over: Record<string, unknown> = {}) => ({
  id,
  household_id: 'h1',
  name,
  kind,
  currency: 'USD',
  opening_balance: 0,
  archived_at: null,
  deleted_at: null,
  version: 1,
  use: null,
  use_purpose: null,
  use_envelope_id: null,
  use_extra_set_aside: null,
  ...over,
});
let mockAccounts: Record<string, unknown>[] = [];
let mockPots: Record<string, unknown>[] = [];
let mockSettings: Record<string, unknown> | null = null;
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/data/queries/activity', () => ({
  useAccountBalances: () => ({ balances: new Map(mockAccounts.map((a) => [a.id, { balance: 120000, overflow: false }])), isLoading: false }),
}));
jest.mock('@/data/queries/decide', () => ({
  usePots: () => ({ data: { plain: mockPots, live: mockPots, wait: [], done: [] } }),
  useDecideSettings: () => ({ data: mockSettings }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
}));

const wrap = (node: React.ReactNode) => (
  <ThemeProvider>
    <FontScaleProvider>{node}</FontScaleProvider>
  </ThemeProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockAccounts = [];
  mockPots = [];
  mockSettings = null;
});

describe('AccountUseStep', () => {
  it('holds Continue until every account is answered and saves nothing itself', async () => {
    const ready: SetupStepReady[] = [];
    const ref = React.createRef<{ save(): { stepId: string | null } }>();
    mockAccounts = [acct('a1', 'Main', 'checking')];
    await render(wrap(<AccountUseStep ref={ref} mode="stepper" onReadyChange={(r) => ready.push(r)} />));
    expect(ready[ready.length - 1]!.canContinue).toBe(false);
    expect(ref.current!.save()).toEqual({ stepId: null });
  });

  it('allows Continue once every account has a stored use', async () => {
    const ready: SetupStepReady[] = [];
    mockAccounts = [acct('a1', 'Main', 'checking', { use: 'everyday' })];
    await render(wrap(<AccountUseStep mode="stepper" onReadyChange={(r) => ready.push(r)} />));
    expect(ready[ready.length - 1]).toMatchObject({ canContinue: true, reasonKey: null });
  });
});
