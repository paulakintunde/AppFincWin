// 09-24 Task 1: SampleHost seeds once in sample mode only, opens the sample answer once, and the figures card shows only in
// sample mode until "Explore the app".
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { PlanStatus } from '@/features/plans/types';
import { SampleHost, sampleAnswerCheckId, sampleAnswerHref } from '../SampleHost';
import { SampleFiguresCard } from '../SampleFiguresCard';
import { sampleCardKey, sampleOpenedKey } from '../sampleFlags';

jest.setTimeout(30000);

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));

let mockPlan: { status: PlanStatus; loading: boolean } = { status: 'sample', loading: false };
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => mockPlan }));

const USER = 'u-1';
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u-1' }, status: 'signedIn' }) }));

const mockRc = { ready: true, userId: USER, householdId: 'h-1', today: '2026-11-19' };
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => mockRc }));

let mockSamples = { hasSamples: false, isSuccess: true };
jest.mock('@/data/queries/recordPrefs', () => ({ useSampleExists: () => mockSamples }));

let mockChecks: DecideCheckRow[] | undefined;
jest.mock('@/data/queries/decide', () => ({ useDecideChecks: () => ({ data: mockChecks }) }));

const mockSeed = jest.fn(async () => true);
const mockSampleArgs: unknown[] = [];
jest.mock('@/data/mutations/sampleData', () => ({
  useSampleData: (ctx: unknown) => {
    mockSampleArgs.push(ctx);
    return { seed: mockSeed, clear: jest.fn(), declinePrompt: jest.fn(), pending: false };
  },
}));

function check(id: string, created: string, extra: Partial<DecideCheckRow> = {}): DecideCheckRow {
  return { id, created_at: created, is_sample: true, deleted_at: null, ...extra } as DecideCheckRow;
}

const push = router.push as jest.Mock;
const navigate = router.navigate as jest.Mock;

beforeEach(async () => {
  mockPlan = { status: 'sample', loading: false };
  mockSamples = { hasSamples: false, isSuccess: true };
  mockChecks = undefined;
  mockSeed.mockClear();
  mockSampleArgs.length = 0;
  push.mockClear();
  navigate.mockClear();
  await AsyncStorage.clear();
});

describe('sampleAnswerCheckId', () => {
  it('picks the oldest live sample check and ignores real and deleted ones', () => {
    const rows = [
      check('real', '2026-01-01', { is_sample: false }),
      check('gone', '2026-01-02', { deleted_at: '2026-02-01' }),
      check('b', '2026-01-04'),
      check('a', '2026-01-03'),
    ];
    expect(sampleAnswerCheckId(rows)).toBe('a');
    expect(sampleAnswerCheckId([])).toBeNull();
    expect(sampleAnswerCheckId(undefined)).toBeNull();
  });
});

describe('SampleHost', () => {
  it('seeds once with today when status is sample and there is no sample data', async () => {
    const view = await render(<SampleHost />);
    await waitFor(() => expect(mockSeed).toHaveBeenCalledTimes(1));
    expect(mockSampleArgs[0]).toEqual({ userId: USER, householdId: 'h-1', today: '2026-11-19' });
    await view.rerender(<SampleHost />);
    expect(mockSeed).toHaveBeenCalledTimes(1);
  });

  it.each<PlanStatus>(['trial', 'active', 'tester', 'grace', 'locked'])('never seeds or navigates when status is %s', async (status) => {
    mockPlan = { status, loading: false };
    mockChecks = [check('a', '2026-01-01')];
    await render(<SampleHost />);
    await act(async () => {});
    expect(mockSeed).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('never seeds while the plan is still loading (loading reports sample)', async () => {
    mockPlan = { status: 'sample', loading: true };
    await render(<SampleHost />);
    await act(async () => {});
    expect(mockSeed).not.toHaveBeenCalled();
  });

  it('does not seed when sample data already exists or the read failed', async () => {
    mockSamples = { hasSamples: true, isSuccess: true };
    await render(<SampleHost />);
    mockSamples = { hasSamples: false, isSuccess: false };
    await render(<SampleHost />);
    await act(async () => {});
    expect(mockSeed).not.toHaveBeenCalled();
  });

  it('opens the seeded sample answer the first time and remembers it', async () => {
    mockSamples = { hasSamples: true, isSuccess: true };
    mockChecks = [check('c-2', '2026-02-01'), check('c-1', '2026-01-01')];
    await render(<SampleHost />);
    await waitFor(() => expect(push).toHaveBeenCalledWith(sampleAnswerHref('c-1')));
    expect(push).toHaveBeenCalledTimes(1);
    await waitFor(async () => expect(await AsyncStorage.getItem(sampleOpenedKey(USER))).toBe('1'));
  });

  it('stays on Home on later launches', async () => {
    await AsyncStorage.setItem(sampleOpenedKey(USER), '1');
    mockSamples = { hasSamples: true, isSuccess: true };
    mockChecks = [check('c-1', '2026-01-01')];
    await render(<SampleHost />);
    await act(async () => {});
    expect(push).not.toHaveBeenCalled();
  });

  it('points at the answer route, where the engine judges the stored sample check', () => {
    expect(sampleAnswerHref('c-1')).toEqual({ pathname: '/decide/answer/[id]', params: { id: 'c-1' } });
  });
});

describe('SampleFiguresCard', () => {
  const wrap = () => render(<ThemeProvider><SampleFiguresCard /></ThemeProvider>);

  it('shows in sample mode and hides for good after Explore the app', async () => {
    const view = await wrap();
    await waitFor(() => expect(view.getByText('You are looking at sample figures. They are not yours.')).toBeTruthy());
    await fireEvent.press(view.getByText('Explore the app'));
    expect(view.queryByTestId('sample-figures-card')).toBeNull();
    expect(navigate).toHaveBeenCalled();
    expect(await AsyncStorage.getItem(sampleCardKey(USER))).toBe('1');
    const again = await wrap();
    await act(async () => {});
    expect(again.queryByTestId('sample-figures-card')).toBeNull();
  });

  it.each<PlanStatus>(['trial', 'active', 'tester'])('does not show when status is %s', async (status) => {
    mockPlan = { status, loading: false };
    const view = await wrap();
    await act(async () => {});
    expect(view.queryByTestId('sample-figures-card')).toBeNull();
  });
});
