import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { DecideSettingsPatch } from '@/db/decideSettings';
import { loggedSource, month, noneSource, roughSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { homeCardModel } from '../homeCardModel';
import { MonthDetailsSheet } from '../MonthDetailsSheet';
import type { SnapshotResult } from '../../snapshot/types';

jest.setTimeout(30000);

const mockUpdate = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@/data/mutations/decideSettings', () => ({
  useUpdateDecideSettings: () => ({ update: (patch: DecideSettingsPatch) => mockUpdate(patch) }),
}));
jest.mock('expo-router', () => ({ router: { navigate: (...a: unknown[]) => mockNavigate(...a), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

const whole = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n / 100))}`;
const SOURCES = '4 months of logged income, 12 expense lines this month, 1 debts and 2 accounts.';

function sheet(source: SnapshotResult | null, over: { onClose?: () => void; note?: string | null } = {}) {
  const card = homeCardModel(source, null, { status: 'ready', homeBasisSeen: true });
  return (
    <MonthDetailsSheet
      visible
      title="Your worst month"
      card={card}
      source={source}
      settings={null}
      userId="u1"
      whole={whole}
      currency="USD"
      sourcesNote={over.note === undefined ? SOURCES : over.note}
      onClose={over.onClose ?? jest.fn()}
    />
  );
}

const variable = () =>
  loggedSource({
    months: [['2026-06', 500_000, 300_000], ['2026-07', 900_000, 300_000], ['2026-08', 100_000, 300_000], ['2026-09', 700_000, 300_000]].map(
      ([m, i, o]) => month(m as string, i as number, o as number)
    ),
  });

describe('MonthDetailsSheet', () => {
  it('D-99 Month details holds the basis control, the columns and the sources note', async () => {
    const onClose = jest.fn();
    await wrap(sheet(variable(), { onClose }));
    expect(screen.getByText('Your worst month')).toBeTruthy();
    expect(screen.getByLabelText('Comes in, $1000')).toBeTruthy();
    expect(screen.getByLabelText('Goes out, $3000')).toBeTruthy();
    expect(screen.getByLabelText(/^Left, /)).toBeTruthy();
    expect(screen.getByText(/4 months ranging \$1000 to \$9000\./)).toBeTruthy();
    expect(screen.getByLabelText('Worst · $1000').props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByLabelText('Average · $5500'));
    expect(mockUpdate).toHaveBeenCalledWith({ basis_override: 'average' });
    expect(screen.getByText(SOURCES)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Activity'));
    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/activity');
    await fireEvent.press(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('D-99 Edit opens the rough figures sheet stacked', async () => {
    await wrap(sheet(roughSource()));
    expect(screen.queryByText('Rough figures')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Edit rough figures'));
    expect(screen.getByText('Rough figures')).toBeTruthy();
    expect(screen.getByText('Your worst month')).toBeTruthy(); // the parent sheet stays beneath
  });

  it('D-97 unavailable Month details shows the reason and one action only', async () => {
    const source = loggedSource();
    const unconverted = { ...source, unconverted: { currencies: ['EUR'] } } as unknown as SnapshotResult;
    await wrap(sheet(unconverted));
    expect(screen.getByText('Lines in EUR are waiting for an exchange rate.')).toBeTruthy();
    expect(screen.getByText('See lines waiting for a rate')).toBeTruthy();
    expect(screen.queryByLabelText(/^Comes in/)).toBeNull();
    expect(screen.queryByLabelText('Judge on')).toBeNull();
    expect(screen.queryByText(SOURCES)).toBeNull();
    await fireEvent.press(screen.getByText('See lines waiting for a rate'));
    expect(mockNavigate).toHaveBeenCalledWith('/activity');
  });

  it('D-97 first run shows the reason and Add rough figures only', async () => {
    await wrap(sheet(noneSource(), { note: null }));
    expect(screen.getByText('There is no full month or rough figure to work from.')).toBeTruthy();
    expect(screen.queryByLabelText(/^Comes in/)).toBeNull();
    await fireEvent.press(screen.getByText('Add rough figures'));
    expect(screen.getByText('Rough figures')).toBeTruthy();
  });
});
