// 09-19 (Owner P4 2026-11-19): the double-cover choice, against a mocked supabase.rpc. One case per behaviour in the plan.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';

const BEA = 'u-bea';
const ALEX = 'u-alex';

const mockRpc = jest.fn();
jest.mock('@/services/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));
let mockUser = { id: BEA };
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('@/data/queries/household', () => ({
  useHouseholdMembers: () => ({
    data: [
      { user_id: BEA, display_name: 'Bea', name_hidden: false },
      { user_id: ALEX, display_name: 'Alex', name_hidden: false },
    ],
  }),
}));
jest.mock('@/features/household/useMemberLabel', () => ({ useMemberLabel: () => (id: string | null) => id ?? '' }));
jest.mock('@/services/errors', () => ({ captureError: jest.fn() }));
const mockToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { DOUBLE_COVER_KEY, useDoubleCover } from '../doubleCover';
import { DoubleCoverNotice } from '../DoubleCoverNotice';

jest.setTimeout(30000);

const ROW = {
  household_id: 'h1',
  since: '2026-11-18T10:00:00Z',
  choose_by: '2026-11-25T10:00:00Z',
  chosen_payer: null,
  chosen_by: null,
  new: { payer_id: BEA, plan_key: 'household', fits: true },
  old: { payer_id: ALEX, plan_key: 'household', fits: true },
};

let stateRow: unknown = ROW;
let chooseAnswer: () => Promise<{ data: unknown; error: unknown }>;

function Harness() {
  const q = useDoubleCover('h1');
  return <DoubleCoverNotice state={q.data ?? null} homeName="The Flat" />;
}

let qc: QueryClient;
async function open() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return await render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <Harness />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

const NEW_LABEL = 'Keep Household, paid by Bea';
const OLD_LABEL = 'Keep Household, paid by Alex';

beforeEach(() => {
  mockRpc.mockReset();
  mockToast.mockReset();
  mockUser = { id: BEA };
  stateRow = ROW;
  chooseAnswer = async () => ({ data: { ok: true, note: 'chosen', chosen_payer: BEA }, error: null });
  mockRpc.mockImplementation((name: string) => {
    if (name === 'plan_double_cover_state') return Promise.resolve({ data: stateRow, error: null });
    if (name === 'plan_double_cover_choose') return chooseAnswer();
    return Promise.resolve({ data: null, error: null });
  });
});

describe('DoubleCoverNotice', () => {
  it('for the new payer: title, body, both buttons and the default line', async () => {
    await open();
    expect(await screen.findByText('Two plans cover this home')).toBeTruthy();
    expect(screen.getByText(/^Two plans cover this home\. Pick one\./)).toBeTruthy();
    expect(screen.getByText(/If neither of you picks within 7 days, the newer plan stays\./)).toBeTruthy();
    expect(screen.getByText(NEW_LABEL)).toBeTruthy();
    expect(screen.getByText(OLD_LABEL)).toBeTruthy();
    expect(screen.getByTestId('double-cover-keep-new')).toBeTruthy();
    expect(screen.getByTestId('double-cover-keep-old')).toBeTruthy();
  });

  it('for the old payer: the same choice', async () => {
    mockUser = { id: ALEX };
    await open();
    expect(await screen.findByText(NEW_LABEL)).toBeTruthy();
    expect(screen.getByText(OLD_LABEL)).toBeTruthy();
  });

  it('renders nothing when the server answers null (not a payer) or a plan is already picked', async () => {
    stateRow = null;
    await open();
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('plan_double_cover_state'));
    expect(screen.queryByTestId('double-cover-notice')).toBeNull();
    stateRow = { ...ROW, chosen_payer: BEA, chosen_by: 'payer' };
    await open();
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('double-cover-notice')).toBeNull();
  });

  it('offers only the plan that fits', async () => {
    stateRow = { ...ROW, old: { payer_id: ALEX, plan_key: 'duo', fits: false } };
    await open();
    expect(await screen.findByText(NEW_LABEL)).toBeTruthy();
    expect(screen.queryByTestId('double-cover-keep-old')).toBeNull();
    expect(screen.queryByText('Keep Duo, paid by Alex')).toBeNull();
  });

  it('a pick calls plan_double_cover_choose once, holds both buttons while pending, then refreshes', async () => {
    let resolve: (v: { data: unknown; error: unknown }) => void = () => undefined;
    chooseAnswer = () => new Promise((r) => (resolve = r));
    await open();
    await screen.findByText(NEW_LABEL);
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await act(async () => {
      fireEvent.press(screen.getByText(NEW_LABEL));
    });
    await act(async () => {
      fireEvent.press(screen.getByText(OLD_LABEL));
    });
    const picks = mockRpc.mock.calls.filter((c) => c[0] === 'plan_double_cover_choose');
    expect(picks).toEqual([['plan_double_cover_choose', { p_household: 'h1', p_keep_payer: BEA }]]);
    await waitFor(() => expect(screen.getByRole('button', { name: NEW_LABEL })).toBeDisabled());
    expect(screen.getByRole('button', { name: OLD_LABEL })).toBeDisabled();
    await act(async () => {
      resolve({ data: { ok: true, note: 'chosen', chosen_payer: BEA }, error: null });
    });
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: DOUBLE_COVER_KEY('h1') }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['plan-state', BEA] });
  });

  it('a refusal or an error leaves the buttons usable and shows a toast', async () => {
    chooseAnswer = async () => ({ data: { ok: false, reason: 'plan_too_small' }, error: null });
    await open();
    await screen.findByText(NEW_LABEL);
    await act(async () => {
      fireEvent.press(screen.getByText(OLD_LABEL));
    });
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ kind: 'refusal', text: { key: 'grow.common.notSaved' } }));
    chooseAnswer = async () => ({ data: null, error: new Error('network') });
    await act(async () => {
      fireEvent.press(screen.getByText(OLD_LABEL));
    });
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(2));
    expect(mockRpc.mock.calls.filter((c) => c[0] === 'plan_double_cover_choose')).toHaveLength(2);
  });

  it('has no dismiss control', async () => {
    await open();
    await screen.findByText(NEW_LABEL);
    expect(screen.queryByText('Not now')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
