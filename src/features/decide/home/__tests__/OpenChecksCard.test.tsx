import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { showToast } from '@/state/undoToast';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import type { CheckInputs } from '../../snapshot/types';
import { TODAY, loggedSource, month, noneSource, unconvertedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { OpenChecksCard } from '../OpenChecksCard';

jest.setTimeout(30000);

const mockAbandon = jest.fn(() => 'step-1');
const mockTrack = jest.fn();
const mockPush = jest.fn();
jest.mock('@/data/mutations/decideChecks', () => ({ useAbandonCheck: () => ({ abandon: mockAbandon }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPush(...a) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/ui/haptics', () => ({
  hapticLight: jest.fn(),
  hapticSelection: jest.fn(),
  hapticWarning: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticMedium: jest.fn(),
}));
const mockSwipe: { props: Record<string, any> } = { props: {} };
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: R.forwardRef((props: any, ref: any) => {
      mockSwipe.props = props;
      R.useImperativeHandle(ref, () => ({ close: jest.fn() }));
      return <View>{props.children}</View>;
    }),
  };
});
// Stands in for the sheet so the confirm renders inline.
jest.mock('@/ui/Sheet', () => {
  const { Pressable, View } = require('react-native');
  return {
    Sheet: ({ visible, onDismiss, children }: { visible: boolean; onDismiss: () => void; children: React.ReactNode }) =>
      visible ? (
        <View>
          <Pressable accessibilityLabel="sheet-dismiss" onPress={onDismiss} />
          {children}
        </View>
      ) : null,
  };
});

beforeEach(() => jest.clearAllMocks());

function inputs(over: Partial<CheckInputs> = {}): CheckInputs {
  return { ...emptyCheckInputs('buy', TODAY), name: 'Laptop', advertised: 150_000, method: 'cash', ...over };
}

function checkRow(id: string, over: Partial<DecideCheckRow> = {}, inp: CheckInputs = inputs()): DecideCheckRow {
  return {
    id,
    household_id: 'h1',
    created_by: 'u1',
    kind: inp.kind,
    name: inp.name,
    inputs: inp as unknown as Record<string, unknown>,
    status: 'open',
    furthest_step: 1,
    last_seen_state: null,
    last_seen_basis: null,
    reopened_from: null,
    decided_at: null,
    verdict_at_decision: null,
    estimate_day_one: null,
    estimate_monthly: null,
    wait_monthly: null,
    ready_by: null,
    broke_line: false,
    cooling_off_at: null,
    estimate_monthly_payment: null,
    estimate_running: null,
    is_sample: false,
    deleted_at: null,
    version: 1,
    updated_by: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

const whole = (n: number) => `$${Math.round(n / 100)}`;

function tree(checks: DecideCheckRow[], source = loggedSource()) {
  return (
    <ThemeProvider>
      <OpenChecksCard source={source} checks={checks} today={TODAY} whole={whole} currency="USD" />
    </ThemeProvider>
  );
}
const renderCard = (checks: DecideCheckRow[], source = loggedSource()) => render(tree(checks, source));

const stressed = () =>
  loggedSource({ months: ['2026-06', '2026-07', '2026-08', '2026-09'].map((m) => month(m, 500_000, 480_000)) });

describe('OpenChecksCard', () => {
  it('D-72 Open checks is hidden while empty', async () => {
    await renderCard([]);
    expect(screen.queryByText('Open checks')).toBeNull();
    expect(screen.queryByText('No checks open')).toBeNull();
    expect(screen.queryByText('+ Purchase')).toBeNull();
  });

  it('shows a row with its chip and sub-line recomputed from the snapshot', async () => {
    await renderCard([checkRow('a')]);
    expect(screen.getByText('Laptop')).toBeTruthy();
    expect(screen.getByText('It fits')).toBeTruthy();
    expect(screen.getByText(/\$1500 · Paid in full · leaves \$\d+ a month/)).toBeTruthy();
    expect(screen.queryByText(/Changed since you looked/)).toBeNull();
  });

  it('shows Draft and the quoted line when no payment method is chosen', async () => {
    await renderCard([checkRow('a', {}, inputs({ method: null }))]);
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByText('$1500 quoted · no payment method yet')).toBeTruthy();
  });

  it('shows Missing terms when the snapshot is unconverted', async () => {
    await renderCard([checkRow('a')], unconvertedSource());
    expect(screen.getByText('Missing terms')).toBeTruthy();
  });

  it('CR-B02 (D-67): a check typed in GBP is priced and judged in USD; one with no stored rate reads Missing terms with no price', async () => {
    const fx = {
      rates: [
        { quote: 'USD', rate: '1.0800000000', rate_date: '2026-10-14', source: 'frankfurter-v2' as const },
        { quote: 'GBP', rate: '0.8600000000', rate_date: '2026-10-12', source: 'frankfurter-v2' as const },
      ],
      customs: [],
      today: TODAY,
    };
    await renderCard([checkRow('a', {}, inputs({ currency: 'GBP', advertised: 100_000 })), checkRow('b', { name: 'Yen' }, inputs({ name: 'Yen', currency: 'JPY' }))], { ...loggedSource(), fx });
    expect(screen.getByText(/^\$1256 · Paid in full/)).toBeTruthy();
    expect(screen.getByText('Missing terms')).toBeTruthy();
    expect(screen.queryByText(/\$1500/)).toBeNull();
  });

  it('shows no chip when there are no figures to judge against', async () => {
    await renderCard([checkRow('a')], noneSource());
    expect(screen.queryByText('It fits')).toBeNull();
    expect(screen.queryByText('Draft')).toBeNull();
  });

  it('flips a fits check to adjust and says so in words when the snapshot gets worse; nothing is written', async () => {
    const row = checkRow('a', { last_seen_state: 'fits' });
    const view = await renderCard([row]);
    expect(screen.queryByText(/Changed since you looked/)).toBeNull();
    await view.rerender(tree([row], stressed()));
    expect(screen.getByText('Needs adjustment')).toBeTruthy();
    expect(screen.getByText('Changed since you looked · was It fits')).toBeTruthy();
    expect(mockAbandon).not.toHaveBeenCalled();
  });

  it('does not show the marker when no state was seen yet', async () => {
    await renderCard([checkRow('a', { last_seen_state: null })], stressed());
    expect(screen.queryByText(/Changed since you looked/)).toBeNull();
  });

  it('another check can flip the changed marker', async () => {
    const a = checkRow('a', { last_seen_state: 'fits' }, inputs({ advertised: 150_000 }));
    const view = await renderCard([a]);
    expect(screen.queryByText(/Changed since you looked/)).toBeNull();
    const b = checkRow('b', { created_at: '2026-10-02T00:00:00Z' }, inputs({ name: 'Desk', advertised: 1_000_000 }));
    await view.rerender(tree([a, b]));
    expect(screen.getByText('Changed since you looked · was It fits')).toBeTruthy();
    // With its own toggle off the check is judged alone again.
    const alone = checkRow('a', { last_seen_state: 'fits' }, inputs({ advertised: 150_000, combine: false }));
    await view.rerender(tree([alone, b]));
    expect(screen.queryAllByText('Changed since you looked · was It fits')).toHaveLength(0);
  });

  it('opens a priced check at step 3 and an incomplete one at step 1', async () => {
    await renderCard([checkRow('a'), checkRow('b', { created_at: '2026-10-02T00:00:00Z' }, inputs({ name: 'Bike', method: null }))]);
    await fireEvent.press(screen.getByText('Laptop'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/decide/check/[id]', params: { id: 'a', step: '3' } });
    await fireEvent.press(screen.getByText('Bike'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/decide/check/[id]', params: { id: 'b', step: '1' } });
  });

  it('D-73 deleting an open check confirms, soft-deletes in one undo step and toasts Check deleted with Undo', async () => {
    const row = checkRow('a');
    await renderCard([row]);
    await fireEvent.press(screen.getByLabelText('More for Laptop'));
    await fireEvent.press(screen.getByLabelText('Delete'));
    expect(screen.getByText('Delete this check?')).toBeTruthy();
    expect(screen.getByText('It leaves Open checks. Nothing was written, so no balance changes.')).toBeTruthy();
    expect(mockAbandon).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Delete', { exact: true }));
    expect(mockAbandon).toHaveBeenCalledTimes(1);
    expect(mockAbandon).toHaveBeenCalledWith(row, 'deleted');
    expect(showToast).toHaveBeenCalledWith({ kind: 'destructive', text: { key: 'decide.delete.toastCheck' }, stepId: 'step-1' });
    expect(mockTrack).toHaveBeenCalledWith('check_abandoned', {});
  });

  it('D-73 Keep it leaves the open check; a swipe only opens the confirm', async () => {
    await renderCard([checkRow('a')]);
    await act(async () => {
      mockSwipe.props.onSwipeableOpen('left');
    });
    expect(screen.getByText('Delete this check?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Keep it'));
    expect(screen.queryByText('Delete this check?')).toBeNull();
    expect(mockAbandon).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(screen.getByText('Laptop')).toBeTruthy();
  });

  it('D-73 the menu Open opens the check', async () => {
    await renderCard([checkRow('a')]);
    await fireEvent.press(screen.getByLabelText('More for Laptop'));
    await fireEvent.press(screen.getByLabelText('Open'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/decide/check/[id]', params: { id: 'a', step: '3' } });
  });

  it('D-73 no x remains on open check rows', async () => {
    await renderCard([checkRow('a')]);
    expect(screen.queryByLabelText('Abandon Laptop')).toBeNull();
  });

  it('D-76 the name clamps at two lines and the full name is in the row label', async () => {
    const long = 'A very long laptop name that the user typed and that goes on and on past two lines of text';
    await renderCard([checkRow('a', { name: long }, inputs({ name: long }))]);
    const text = screen.getByText(long);
    expect(text.props.numberOfLines).toBe(2);
    expect(text.props.ellipsizeMode).toBe('tail');
    expect(screen.getByLabelText(new RegExp('^' + long))).toBeTruthy();
  });

  it('starts a new purchase or investment check from the heading links', async () => {
    await renderCard([checkRow('a')]);
    await fireEvent.press(screen.getByText('+ Purchase'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/decide/check/[id]', params: { id: 'new-id', kind: 'buy' } });
    await fireEvent.press(screen.getByText('+ Investment'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/decide/check/[id]', params: { id: 'new-id', kind: 'invest' } });
  });

  it('ignores deleted and decided checks', async () => {
    await renderCard([checkRow('a', { deleted_at: '2026-10-05T00:00:00Z' }), checkRow('b', { status: 'waiting' })]);
    expect(screen.queryByText('Open checks')).toBeNull();
  });
});
