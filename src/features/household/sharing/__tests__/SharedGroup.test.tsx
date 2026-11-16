import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { TransactionRow } from '@/db/rows';
import { SharedGroup, useSharedEntry, type SharedEntry } from '../SharedGroup';

jest.setTimeout(30000);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ showCents: true }) }));

function member(id: string, name: string, weight: number, colour: number) {
  return { household_id: 'h', user_id: id, is_owner: id === 'me', role_label: 'Flatmate', weight, colour_key: colour, display_name: name, name_hidden: false, version: 1 };
}
let mockMembers = [member('me', 'Paul', 50, 0), member('sam', 'Sam', 50, 1)];
jest.mock('@/data/queries/household', () => ({
  useHouseholdMembers: () => ({ data: mockMembers }),
  useFormerMembers: () => ({ data: [] }),
}));
jest.mock('@/features/household/useHouseholdScope', () => ({
  useHouseholdScope: () => ({
    userId: 'me',
    householdId: 'h',
    household: { id: 'h', name: 'Flat 4B', reporting_currency: 'USD', owner_id: 'me', version: 1 },
    name: 'Flat 4B',
    members: mockMembers,
    isOwner: true,
    online: true,
  }),
}));
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ byId: new Map(), all: [], active: [] }) }));
jest.mock('@/data/queries/householdBalances', () => ({ useSplitDefaults: () => ({ data: [] }), useSettlements: () => ({ data: [] }) }));

let mockCover: 'settled' | 'waiting' | null = null;
jest.mock('../sharedLineState', () => ({
  ...jest.requireActual('../sharedLineState'),
  useLineCover: () => mockCover,
  useStoredSplit: () => null,
}));

const mockShare = jest.fn();
const mockMakePrivate = jest.fn();
jest.mock('@/data/mutations/householdSharing', () => ({
  useShareLine: () => ({ mutate: (...a: unknown[]) => mockShare(...a) }),
  useSetLineSplit: () => ({ mutate: jest.fn() }),
  useSetPaidBy: () => ({ mutate: jest.fn() }),
  useMakeLinePrivate: () => ({ mutate: (...a: unknown[]) => mockMakePrivate(...a) }),
}));
jest.mock('../../WeightsSheet', () => ({ WeightsSheet: () => null }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticWarn: jest.fn(), hapticTick: jest.fn(), hapticFailed: jest.fn(), hapticMilestone: jest.fn() }));

const entryRef: { current: SharedEntry | null } = { current: null };

function Harness({ editRow = null, joint = false, inSeries = false }: { editRow?: TransactionRow | null; joint?: boolean; inSeries?: boolean }) {
  const entry = useSharedEntry({ editRow, accountShared: joint, categoryId: null });
  React.useEffect(() => {
    entryRef.current = entry;
  });
  return <SharedGroup entry={entry} currency="USD" amountMinor={8400} inSeries={inSeries} />;
}

async function setup(props: React.ComponentProps<typeof Harness> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <Harness {...props} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

function row(over: Record<string, unknown> = {}): TransactionRow {
  return {
    id: 'l1',
    household_id: 'h',
    created_by: 'me',
    paid_by: null,
    is_shared: false,
    split_rule: null,
    recurring_series_id: null,
    version: 3,
    local_date: '2026-11-03',
    ...over,
  } as unknown as TransactionRow;
}

beforeEach(() => {
  mockShare.mockClear();
  mockMakePrivate.mockClear();
  mockCover = null;
  mockMembers = [member('me', 'Paul', 50, 0), member('sam', 'Sam', 50, 1)];
});

describe('SharedGroup', () => {
  it('is hidden for a household of one', async () => {
    mockMembers = [member('me', 'Paul', 100, 0)];
    await setup();
    expect(screen.queryByTestId('shared-group')).toBeNull();
    expect(screen.queryByText('Shared')).toBeNull();
  });

  it('shows the switch, and Paid by and Split rows once it is on', async () => {
    await setup();
    expect(screen.getByRole('switch')).toBeTruthy();
    expect(screen.queryByTestId('split-row')).toBeNull();
    await fireEvent.press(screen.getByRole('switch'));
    expect(screen.getByTestId('paid-by-row')).toBeTruthy();
    expect(screen.getByTestId('split-row')).toBeTruthy();
    expect(screen.getByText('Even · You $42.00, Sam $42.00')).toBeTruthy();
  });

  it('on a joint account shows the badge and the note, not the switch', async () => {
    await setup({ joint: true });
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText('Lines on this account are shared')).toBeTruthy();
    expect(screen.getByText('Paid from a shared account, so it counts toward each share and creates no owing.')).toBeTruthy();
  });

  it('a debt or goal payment has no switch and says it stays personal', async () => {
    await setup({ editRow: row({ debt_id: 'd1' }) });
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText('Debt and goal payments stay personal.')).toBeTruthy();
  });

  it('asks about every month when a line in a series is switched on', async () => {
    await setup({ inSeries: true });
    await fireEvent.press(screen.getByRole('switch'));
    expect(screen.getByText('Share every month of this bill?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Share every month'));
    expect(entryRef.current?.draft.seriesScope).toBe('series');
  });

  it('is disabled when a settle-up covers the line, with the reason', async () => {
    mockCover = 'settled';
    await setup({ editRow: row({ is_shared: true, split_rule: 'even' }) });
    expect(screen.getByRole('switch').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('A settle-up covers this line, so it can’t be made private. Edit the split instead.')).toBeTruthy();
  });

  it('a member who did not log the line gets no switch', async () => {
    await setup({ editRow: row({ is_shared: true, created_by: 'sam', paid_by: 'sam', split_rule: 'even' }) });
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByTestId('split-row')).toBeTruthy();
  });

  it('enqueues the share after the line is saved, leaving the rule to the household default', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('switch'));
    entryRef.current?.commit({ id: 'new1', version: 1, month: '2026-11' });
    expect(mockShare).toHaveBeenCalledWith({ householdId: 'h', month: '2026-11', id: 'new1', expectedVersion: 1, seriesScope: 'one' });
  });

  it('enqueues make-private when the creator switches an existing shared line off', async () => {
    await setup({ editRow: row({ is_shared: true, split_rule: 'even' }) });
    await fireEvent.press(screen.getByRole('switch'));
    entryRef.current?.commit({ id: 'l1', version: 3, month: '2026-11' });
    expect(mockMakePrivate).toHaveBeenCalledWith({ householdId: 'h', month: '2026-11', id: 'l1', expectedVersion: 3 });
  });
});
