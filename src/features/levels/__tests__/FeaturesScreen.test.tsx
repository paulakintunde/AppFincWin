import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { FeatureAccess } from '../evaluateAccess';
import { FEATURES, type FeatureDef, type Level } from '../featureRegistry';
import { FeaturesScreen, parseFeaturesPreview } from '../FeaturesScreen';
import { featureSwitchesOpen } from '../evaluateAccess';

jest.setTimeout(30000);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const { View, Text } = jest.requireActual('react-native');
  return {
    DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <View>
        <Text>{title}</Text>
        {children}
      </View>
    ),
  };
});

interface Scenario {
  level: Level;
  planWritable: boolean;
  shares: boolean;
  switches: Record<string, boolean>;
  holds: Record<string, boolean>;
}
let mockScenario: Scenario;
let mockPlan: { writable: boolean; status?: string; loading?: boolean };

jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => mockPlan }));
jest.mock('../useUserSetup', () => ({ useUserSetup: () => ({ data: { level: mockScenario.level }, loading: false }) }));
jest.mock('../useFeatureAccess', () => ({
  useAllFeatureAccess: (preview?: { level: number; switches: Record<string, boolean> }) => {
    const { FEATURES: all } = require('../featureRegistry');
    const { evaluateAccess: evaluate } = require('../evaluateAccess');
    return all.map((def: FeatureDef) =>
      evaluate({
        def,
        level: preview?.level ?? mockScenario.level,
        switchOn: (preview?.switches ?? mockScenario.switches)[def.id],
        planWritable: mockScenario.planWritable,
        sharesInHousehold: mockScenario.shares,
        holdsData: def.holdsData !== null && mockScenario.holds[def.holdsData] === true,
      })
    ) as FeatureAccess[];
  },
}));

const mockSet = jest.fn();
jest.mock('@/data/mutations/userSetup', () => ({ useSetFeatureSwitch: () => ({ setFeatureSwitch: (v: unknown) => mockSet(v) }) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
const mockShowToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockShowToast(t) }));
const mockTrack = jest.fn();
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn() }));

function renderScreen() {
  return render(
    <ThemeProvider>
      <FeaturesScreen />
    </ThemeProvider>
  );
}

describe('FeaturesScreen (UI-SPEC 11)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSet.mockClear();
    mockShowToast.mockClear();
    mockTrack.mockClear();
    mockPlan = { writable: true };
    mockScenario = { level: 2, planWritable: true, shares: true, switches: {}, holds: {} };
  });

  it('shows the level card, the count, Run setup again and the area sections in order', async () => {
    const { getByText, getByTestId, queryByTestId } = await renderScreen();
    expect(getByText('Everyday')).toBeTruthy();
    expect(getByText('Your level')).toBeTruthy();
    expect(getByText(`${FEATURES.filter((f) => f.minLevel <= 2).length} of ${FEATURES.length} features on`)).toBeTruthy();
    fireEvent.press(getByText('Run setup again'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/onboarding', params: { mode: 'rerun' } });
    for (const area of ['Recording', 'Accounts', 'Planning', 'Grow', 'Insight', 'Sharing', 'System']) {
      expect(getByTestId(`features-area-${area}`)).toBeTruthy();
    }
    expect(queryByTestId('features-choose-plan')).toBeNull();
  });

  it('on and in your level: no reason, switch on; turning it off says so with Undo that restores it', async () => {
    const { getByLabelText } = await renderScreen();
    const row = getByLabelText('Categories');
    expect(row.props.accessibilityState.checked).toBe(true);
    fireEvent.press(row);
    expect(mockSet).toHaveBeenCalledWith({ userId: 'u1', featureId: 'categories', isOn: false });
    expect(mockTrack).toHaveBeenCalledWith('feature_switch_changed', { feature: 'categories', on: false });
    const toast = mockShowToast.mock.calls[0]?.[0] as { text: { key: string; params: Record<string, string> }; onUndo: () => void };
    expect(toast.text).toEqual({ key: 'features.toastOff', params: { feature: 'Categories' } });
    mockSet.mockClear();
    toast.onUndo();
    expect(mockSet).toHaveBeenCalledWith({ userId: 'u1', featureId: 'categories', isOn: true });
  });

  it('off in your level: switch off, no reason, turns on', async () => {
    mockScenario.switches = { categories: false };
    const { getByLabelText } = await renderScreen();
    const row = getByLabelText('Categories');
    expect(row.props.accessibilityState.checked).toBe(false);
    fireEvent.press(row);
    expect(mockSet).toHaveBeenCalledWith({ userId: 'u1', featureId: 'categories', isOn: true });
    expect((mockShowToast.mock.calls[0]?.[0] as { text: { key: string } }).text.key).toBe('features.toastOn');
  });

  it('07-05: a level-2 user has the Insights row on and the level-3 Insight rows marked Not in your level', async () => {
    const { getByTestId, getByLabelText } = await renderScreen();
    expect(getByTestId('features-area-Insight')).toBeTruthy();
    expect(getByLabelText('Insights').props.accessibilityState.checked).toBe(true);
    expect(getByLabelText('Score, Not in your level').props.accessibilityState.checked).toBe(false);
    expect(getByLabelText('Net worth over time, Not in your level').props.accessibilityState.checked).toBe(false);
  });

  it('above your level: says Not in your level and the switch still works (owner Q6)', async () => {
    const { getByLabelText, getAllByText } = await renderScreen();
    expect(getAllByText(/Not in your level/).length).toBeGreaterThan(0);
    const row = getByLabelText('Debt, Not in your level');
    expect(row.props.accessibilityState.disabled).toBe(false);
    expect(row.props.accessibilityState.checked).toBe(false);
    fireEvent.press(row);
    expect(mockSet).toHaveBeenCalledWith({ userId: 'u1', featureId: 'debts', isOn: true });
    expect(mockTrack).toHaveBeenCalledWith('feature_switch_changed', { feature: 'debts', on: true });
    const toast = mockShowToast.mock.calls[0]?.[0] as { text: { key: string; params: Record<string, string> }; onUndo: () => void };
    expect(toast.text).toEqual({ key: 'features.toastOn', params: { feature: 'Debt' } });
    mockSet.mockClear();
    toast.onUndo();
    expect(mockSet).toHaveBeenCalledWith({ userId: 'u1', featureId: 'debts', isOn: false });
  });

  it('household rules it out: disabled with its reason and a Set up sharing link; pressing does nothing', async () => {
    mockScenario.shares = false;
    const { getByLabelText, getAllByText } = await renderScreen();
    const row = getByLabelText('Split by weight, Not on for your household');
    expect(row.props.accessibilityState.disabled).toBe(true);
    expect(row.props.accessibilityState.checked).toBe(false);
    fireEvent.press(row);
    expect(mockSet).not.toHaveBeenCalled();
    fireEvent.press(getAllByText('Set up sharing')[0] as never);
    expect(mockPush).toHaveBeenCalledWith('/household');
  });

  it('holds your records: switch on, disabled, says it stays on, even below your level', async () => {
    mockScenario.level = 1;
    mockScenario.holds = { debts: true };
    const { getByLabelText } = await renderScreen();
    const row = getByLabelText('Debt, Has your records, so it stays on');
    expect(row.props.accessibilityState).toMatchObject({ checked: true, disabled: true });
    fireEvent.press(row);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('locked: every row says Needs a plan and is disabled, with one Choose a plan link at the top', async () => {
    mockPlan = { writable: false };
    mockScenario.planWritable = false;
    const { getAllByLabelText, getByTestId, getAllByText } = await renderScreen();
    expect(getAllByText(/Needs a plan/).length).toBe(FEATURES.length);
    const rows = getAllByLabelText(/, Needs a plan$/);
    expect(rows).toHaveLength(FEATURES.length);
    for (const r of rows) expect(r.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(getByTestId('features-choose-plan'));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  // 09-25 (owner): in the sample look-around the switches are the person's own setting and work; no row says Needs a plan.
  it('sample: switches work, no row says Needs a plan, one Choose a plan link leads to the trial', async () => {
    mockPlan = { writable: false, status: 'sample', loading: false };
    mockScenario.planWritable = featureSwitchesOpen({ writable: false, status: 'sample', loading: false });
    const { queryAllByText, getByLabelText, getByTestId } = await renderScreen();
    expect(queryAllByText(/Needs a plan/)).toHaveLength(0);
    const row = getByLabelText(/^Payoff planner/);
    expect(row.props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(row);
    expect(mockSet).toHaveBeenCalledTimes(1);
    await fireEvent.press(getByTestId('features-choose-plan'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ mode: 'first_run' }) }));
  });

  it('featureSwitchesOpen: sample opens the switches; locked and a loading plan do not', () => {
    expect(featureSwitchesOpen({ writable: false, status: 'sample', loading: false })).toBe(true);
    expect(featureSwitchesOpen({ writable: false, status: 'locked', loading: false })).toBe(false);
    expect(featureSwitchesOpen({ writable: false, status: 'sample', loading: true })).toBe(false);
    expect(featureSwitchesOpen({ writable: true, status: 'trial', loading: false })).toBe(true);
  });

  it('search filters by label and sub, and shows the empty state', async () => {
    const { getByPlaceholderText, queryByLabelText, getByText, queryByTestId } = await renderScreen();
    await fireEvent.changeText(getByPlaceholderText('Find a feature'), 'payoff');
    expect(queryByLabelText(/^Payoff planner/)).toBeTruthy();
    expect(queryByLabelText('Categories')).toBeNull();
    expect(queryByTestId('features-area-Recording')).toBeNull();
    await fireEvent.changeText(getByPlaceholderText('Find a feature'), 'zzzz');
    expect(getByText('No feature matches that')).toBeTruthy();
    expect(getByText('Try another word.')).toBeTruthy();
  });

  it('never lists Decide or Coach as a row', async () => {
    const { queryByLabelText } = await renderScreen();
    expect(queryByLabelText(/^Decide/)).toBeNull();
    expect(queryByLabelText(/^Coach/)).toBeNull();
  });
});

describe('FeaturesScreen preview (09-23, onboarding summary)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSet.mockClear();
    mockPlan = { writable: false };
    mockScenario = { level: 4, planWritable: true, shares: true, switches: {}, holds: {} };
  });

  it('parses the route params, dropping unknown ids and bad levels', () => {
    expect(parseFeaturesPreview({})).toBeUndefined();
    expect(parseFeaturesPreview({ preview: '1', level: '2', on: 'categories,nope', off: 'goals' })).toEqual({
      level: 2,
      switches: { categories: true, goals: false },
    });
    expect(parseFeaturesPreview({ preview: '1', level: '9' })?.level).toBe(4);
  });

  it('shows the previewed level, read-only switches, and no Run setup again or plan link', async () => {
    const { getByText, queryByText, queryByTestId, getByLabelText, getByTestId } = await render(
      <ThemeProvider>
        <FeaturesScreen preview={{ level: 1, switches: {} }} />
      </ThemeProvider>
    );
    expect(getByTestId('features-preview')).toBeTruthy();
    expect(getByText('Basics')).toBeTruthy();
    expect(queryByText('Run setup again')).toBeNull();
    expect(queryByTestId('features-choose-plan')).toBeNull();
    const row = getByLabelText('Categories');
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(row);
    expect(mockSet).not.toHaveBeenCalled();
  });
});
