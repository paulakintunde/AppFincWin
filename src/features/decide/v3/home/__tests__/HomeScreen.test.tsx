/** 05.3-39: the v3 Decide home assembly (order, D-06 not-ready, setup card, states, criterion 1). */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { checkRow, liveEval } from '../../lists/__tests__/listsTestKit';
import { HomeScreen } from '../HomeScreen';
import { homeState, resetHome } from './homeScreenKit';

jest.setTimeout(60000);

jest.mock('@/data/queries/decideCheckV3', () => ({ useChecksV3: () => jest.requireActual('./homeScreenKit').useChecksV3Double() }));
jest.mock('../../../pots/usePots', () => ({ usePotsRead: () => jest.requireActual('./homeScreenKit').usePotsReadDouble() }));
jest.mock('../../../setup/useSetupFacts', () => ({ useSetupFacts: () => ({ fake: true }) }));
jest.mock('../../../setup/useUnspent', () => ({ useUnspent: () => ({ view: { kind: 'stale', value: 1, days: 45, anchorAt: '2026-09-01' } }) }));
jest.mock('../../../setup/setupFlow', () => ({
  setupStatus: () => jest.requireActual('./homeScreenKit').homeState.setup,
  remainingNeeded: () => (jest.requireActual('./homeScreenKit').homeState.setup === 'done' ? [] : ['pay']),
  firstUnansweredNeeded: () => 'pay',
  isNeeded: () => true,
}));
jest.mock('../../../setup/SetupStatusCard', () => ({
  SetupStatusCard: ({ status }: { status: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`setup-card:${status}`}</Text>;
  },
}));
jest.mock('@/shell/screen/TabRootScreen', () => ({ TabRootScreen: (p: object) => jest.requireActual('./homeScreenKit').TabRootDouble(p) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/shell/header/AvatarButton', () => ({ AvatarButton: () => null }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./homeScreenKit').fakeFormat }));
jest.mock('../../nav/hrefs', () => ({ DECISIONS_HREF: '/decide/decisions', openV3NewCheck: jest.fn() }));
jest.mock('../MonthBarCard', () => ({
  MonthBarCard: ({ unspentStaleDays }: { unspentStaleDays?: number }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`month-card:${unspentStaleDays ?? 'none'}`}</Text>;
  },
}));
jest.mock('../EnvelopeGrid', () => ({
  EnvelopeGrid: ({ envelopes }: { envelopes: { name: string }[] }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`envelopes:${envelopes.map((e) => e.name).join(',')}`}</Text>;
  },
}));
jest.mock('../../refine/RefineCard', () => ({
  RefineCard: () => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{'refine-card'}</Text>;
  },
}));
jest.mock('../SomethingChangedRow', () => ({
  SomethingChangedRow: () => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{'something-row'}</Text>;
  },
}));
jest.mock('../../lists/SavedPlanRow', () => ({
  SavedPlanRow: ({ row, live }: { row: { id: string }; live?: { result: { code: string } } }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text testID={`row-${row.id}`}>{`row:${row.id}:${live?.result.code ?? 'none'}`}</Text>;
  },
}));

const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);

const ALL_MISSING = ['activity_not_current', 'envelopes_unconfirmed', 'past_month_missing'];

beforeEach(() => {
  resetHome();
  jest.clearAllMocks();
});
afterEach(cleanup);

describe('HomeScreen', () => {
  it('ready: month card, refine, check card, envelopes, saved plans, row, past count and footer in order', async () => {
    const sofa = checkRow({ id: 'sofa', name: 'Sofa', status: 'waiting' });
    const car = checkRow({ id: 'car', name: 'Used car', status: 'waiting' });
    homeState.rows = [sofa, car, checkRow({ id: 'b', status: 'bought' }), checkRow({ id: 'p', status: 'passed' })];
    homeState.byId = new Map([
      ['sofa', liveEval('fits_month', null)],
      ['car', liveEval('not_yet', 'not_covered')],
    ]);
    homeState.pots = [{ id: 'e1', name: 'Holiday', saved: 5000 }];
    await wrap(<HomeScreen />);
    expect(screen.getByText('month-card:45')).toBeTruthy();
    expect(screen.getByText('refine-card')).toBeTruthy();
    expect(screen.getByText('Check a purchase')).toBeTruthy();
    expect(screen.getByText('envelopes:Holiday')).toBeTruthy();
    expect(screen.getByText('Saved plans')).toBeTruthy();
    expect(screen.getByTestId('row-sofa')).toBeTruthy();
    expect(screen.getByTestId('row-car')).toBeTruthy();
    expect(screen.queryByText('Unfinished checks')).toBeNull();
    expect(screen.getByText('2 decisions')).toBeTruthy();
    expect(screen.getByText(/FincWin is a record-keeping and planning tool/)).toBeTruthy();
    expect(screen.queryByText(/setup-card/)).toBeNull();

    const order = ['month-card', 'refine-card', 'Check a purchase', 'envelopes:', 'Saved plans', 'something-row', 'Past decisions'];
    const tree = JSON.stringify(screen.toJSON());
    const at = order.map((s) => tree.indexOf(s));
    expect(at.every((n) => n >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('unfinished checks with a name show under their heading, an empty draft does not', async () => {
    homeState.rows = [checkRow({ id: 'u1', name: 'Bike', status: 'open' }), checkRow({ id: 'u2', name: '', status: 'open' })];
    await wrap(<HomeScreen />);
    expect(screen.getByText('Unfinished checks')).toBeTruthy();
    expect(screen.getByTestId('row-u1')).toBeTruthy();
    expect(screen.queryByTestId('row-u2')).toBeNull();
    expect(screen.getByText('Nothing decided yet')).toBeTruthy();
  });

  it('not ready: the not-ready card stands in for the check card and the rest still opens', async () => {
    homeState.missing = ALL_MISSING;
    await wrap(<HomeScreen />);
    expect(screen.queryByText('Check a purchase')).toBeNull();
    expect(screen.getByText('envelopes:')).toBeTruthy();
    expect(screen.getByText('something-row')).toBeTruthy();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(3);
  });

  it('turning ready shows the check card and announces once', async () => {
    homeState.missing = ALL_MISSING;
    const view = await wrap(<HomeScreen />);
    expect(screen.queryByText('Check a purchase')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
    homeState.missing = [];
    await act(async () => {
      view.rerender(<HomeScreen />);
    });
    expect(screen.getByText('Check a purchase')).toBeTruthy();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Decide can check a purchase now.');
  });

  it('setup not started: the setup card comes first and Check a purchase still shows', async () => {
    homeState.setup = 'not_started';
    await wrap(<HomeScreen />);
    expect(screen.getByText('setup-card:not_started')).toBeTruthy();
    expect(screen.getByText('Check a purchase')).toBeTruthy();
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('setup-card')).toBeLessThan(tree.indexOf('month-card'));
  });

  it('the settings button opens Decide settings', async () => {
    await wrap(<HomeScreen />);
    const button = screen.getByLabelText('Decide settings');
    fireEvent.press(button);
    expect(pushOnce).toHaveBeenCalledWith('/decide/settings');
  });

  it('loading shows the skeleton', async () => {
    homeState.status = 'loading';
    await wrap(<HomeScreen />);
    expect(screen.queryByText('Check a purchase')).toBeNull();
    expect(screen.getByLabelText('Loading your figures')).toBeTruthy();
  });

  it('error with nothing cached shows the error copy and Try again refetches', async () => {
    homeState.status = 'error';
    await wrap(<HomeScreen />);
    expect(screen.getByText('Your figures didn’t load')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    expect(homeState.refetch).toHaveBeenCalledTimes(1);
  });

  it('criterion 1: the saved row receives the one evaluation object from useChecksV3', async () => {
    homeState.rows = [checkRow({ id: 'sofa', name: 'Sofa', status: 'waiting' })];
    homeState.byId = new Map([['sofa', liveEval('monthly_short', null)]]);
    await wrap(<HomeScreen />);
    expect(screen.getByTestId('row-sofa').props.children).toBe('row:sofa:monthly_short');
  });
});
