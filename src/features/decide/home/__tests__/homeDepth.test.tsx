import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { DecideSettingsRow, DecideSettingsPatch } from '@/db/decideSettings';
import { loggedSource, month } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { LinesCard } from '../LinesCard';

/** D-78: the Lines fold is closed by default. */
async function wrapOpen(ui: React.ReactElement) {
  await wrap(ui);
  await fireEvent.press(screen.getByText('Lines you will not cross'));
}

jest.setTimeout(30000);

const mockUpdate = jest.fn();
jest.mock('@/data/mutations/decideSettings', () => ({
  useUpdateDecideSettings: () => ({ update: (patch: DecideSettingsPatch) => mockUpdate(patch) }),
}));
jest.mock('@/data/mutations/debts', () => ({ useSetDebtHousing: () => ({ setHousing: jest.fn() }) }));
jest.mock('@/data/queries/decide', () => ({ useDebts: () => ({ data: [] }) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', householdId: 'h1' }) }));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn(), hapticMedium: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

const whole = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n / 100))}`;

function settingsRow(over: Partial<DecideSettingsRow> = {}): DecideSettingsRow {
  return {
    user_id: 'u1',
    currency: 'USD',
    rough_income: null,
    rough_spending: null,
    reserve: null,
    dsr_line: null,
    housing_line: null,
    unsecured_multiple: null,
    investing_floor: null,
    saving_floor: null,
    basis_override: null,
    version: 1,
    updated_at: '2026-10-15T00:00:00Z',
    ...over,
  };
}

const lines = (source = loggedSource(), settings: DecideSettingsRow | null = null) => (
  <LinesCard source={source} settings={settings} userId="u1" currency="USD" whole={whole} />
);

describe('Lines card cushion months (D-25)', () => {
  it('steady income reads default · 3 months and the editor explains why', async () => {
    await wrapOpen(lines());
    expect(screen.getByText('default · 3 months')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('line-row-reserve'));
    expect(screen.getByText(/The default is 3 months of your costs, because your income is steady\./)).toBeTruthy();
  });

  it('volatile income reads default · 6 months', async () => {
    const months = [month('2026-06', 900_000, 300_000), month('2026-07', 100_000, 300_000), month('2026-08', 800_000, 300_000), month('2026-09', 50_000, 300_000)];
    await wrapOpen(lines(loggedSource({ months })));
    expect(screen.getByText(/^default · (4\.5|6) months$/)).toBeTruthy();
  });

  it('under 3 full months reads default · 3 months with the not-known-yet reason', async () => {
    const months = [month('2026-08', 500_000, 300_000), month('2026-09', 500_000, 300_000)];
    await wrapOpen(lines(loggedSource({ months })));
    expect(screen.getByText('default · 3 months')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('line-row-reserve'));
    expect(screen.getByText(/because your income steadiness isn’t known yet\./)).toBeTruthy();
  });

  it('a typed cushion carries no default tag and no months note', async () => {
    await wrapOpen(lines(loggedSource(), settingsRow({ reserve: 250_000 })));
    expect(screen.getByText('$2500')).toBeTruthy();
    expect(screen.queryByText(/^default · /)).toBeNull();
    await fireEvent.press(screen.getByTestId('line-row-reserve'));
    expect(screen.queryByText(/The default is/)).toBeNull();
  });

  it('the other five lines keep the plain default tag', async () => {
    await wrapOpen(lines());
    expect(screen.getAllByText('default')).toHaveLength(5);
  });
});
