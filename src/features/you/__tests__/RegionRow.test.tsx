// 06.1-71 (CN-10, OQ-71-1 B): You > Region sets the country (the user's own choice, else this phone's) and, for the US and Canada,
// the state or province Decide's sales tax estimate reads.
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { RegionRow } from '../components/RegionRow';
import { COUNTRIES, countryName, subdivisionName, subdivisionsOf } from '../regionPlaces';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.setTimeout(30000);

let mockOwn: string | null = null;
let mockUserId: string | null = 'u1';
let mockPhone: string | undefined = 'US';
let mockSubdivision: string | null = null;
const mockSetRegion = jest.fn();
const mockSetSubdivision = jest.fn();

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: mockUserId, householdId: 'h1', homeCurrency: 'USD', region: mockOwn }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  ...jest.requireActual('@/services/locale/deviceLocale'),
  getDeviceRegion: (override?: string | null) => override ?? mockPhone,
}));
jest.mock('@/data/mutations/moneyPrefs', () => ({ useUpdateMoneyPrefs: () => ({ setRegion: (...a: unknown[]) => mockSetRegion(...a) }) }));
jest.mock('@/data/mutations/regionSubdivision', () => ({ useSetRegionSubdivision: () => (...a: unknown[]) => mockSetSubdivision(...a) }));
jest.mock('@/data/queries/regionSubdivision', () => ({ useRegionSubdivision: () => mockSubdivision }));

beforeEach(() => {
  jest.clearAllMocks();
  mockOwn = null;
  mockUserId = 'u1';
  mockPhone = 'US';
  mockSubdivision = null;
});

const renderRow = () =>
  render(
    <ThemeProvider>
      <RegionRow />
    </ThemeProvider>
  );

async function press(node: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(node);
  });
}

describe('RegionRow', () => {
  it('with no choice of its own, shows the phone’s country and the state row for the US', async () => {
    const screen = await renderRow();
    expect(screen.getByLabelText('Region, United States, from this phone')).toBeTruthy();
    expect(screen.getByLabelText('State or province, Not set')).toBeTruthy();
    expect(screen.getByText('Decide uses it to estimate sales tax.')).toBeTruthy();
  });

  it('picking a state stores it', async () => {
    const screen = await renderRow();
    await press(screen.getByTestId('you-region-subdivision'));
    await press(screen.getByLabelText('New York'));
    expect(mockSetSubdivision).toHaveBeenCalledWith('NY');
  });

  it('picking the stored state again writes nothing', async () => {
    mockSubdivision = 'NY';
    const screen = await renderRow();
    expect(screen.getByLabelText('State or province, New York')).toBeTruthy();
    await press(screen.getByTestId('you-region-subdivision'));
    await press(screen.getByLabelText('New York'));
    expect(mockSetSubdivision).not.toHaveBeenCalled();
  });

  it('a country of the user’s own is stored, and a state from another country is dropped', async () => {
    mockSubdivision = 'NY';
    const screen = await renderRow();
    await press(screen.getByTestId('you-region-country'));
    await press(screen.getByLabelText('Canada'));
    expect(mockSetRegion).toHaveBeenCalledWith('CA');
    expect(mockSetSubdivision).toHaveBeenCalledWith(null);
  });

  it('From this phone clears the user’s own choice and keeps a state that still belongs', async () => {
    mockOwn = 'US';
    mockPhone = 'US';
    mockSubdivision = 'TX';
    const screen = await renderRow();
    expect(screen.getByLabelText('Region, United States')).toBeTruthy();
    await press(screen.getByTestId('you-region-country'));
    await press(screen.getByLabelText('From this phone'));
    expect(mockSetRegion).toHaveBeenCalledWith(null);
    expect(mockSetSubdivision).not.toHaveBeenCalled();
  });

  it('picking the country already chosen writes nothing', async () => {
    mockOwn = 'FR';
    const screen = await renderRow();
    expect(screen.getByLabelText('Region, France')).toBeTruthy();
    expect(screen.queryByTestId('you-region-subdivision')).toBeNull();
    await press(screen.getByTestId('you-region-country'));
    await press(screen.getByLabelText('France'));
    expect(mockSetRegion).not.toHaveBeenCalled();
  });

  it('Cancel closes the list', async () => {
    const screen = await renderRow();
    await press(screen.getByTestId('you-region-country'));
    expect(screen.getByLabelText('Germany')).toBeTruthy();
    await press(screen.getByText('Cancel'));
    expect(screen.queryByLabelText('Germany')).toBeNull();
  });

  it('a phone country off the list shows its code', async () => {
    mockPhone = 'JP';
    const screen = await renderRow();
    expect(screen.getByLabelText('Region, JP, from this phone')).toBeTruthy();
  });

  it('with no country at all it says Not set', async () => {
    mockPhone = undefined;
    const screen = await renderRow();
    expect(screen.getByLabelText('Region, Not set')).toBeTruthy();
  });

  it('is off while signed out', async () => {
    mockUserId = null;
    const screen = await renderRow();
    expect(screen.getByTestId('you-region-country').props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe('regionPlaces', () => {
  it('lists the countries the tax estimate knows, A to Z', () => {
    const names = COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    expect(COUNTRIES).toHaveLength(30);
  });

  it('has every US state plus DC and every Canadian province and territory, none elsewhere', () => {
    expect(subdivisionsOf('US')).toHaveLength(51);
    expect(subdivisionsOf('CA')).toHaveLength(13);
    expect(subdivisionsOf('GB')).toEqual([]);
    expect(subdivisionsOf(null)).toEqual([]);
  });

  it('names places, or null when not listed', () => {
    expect(countryName('CA')).toBe('Canada');
    expect(countryName('JP')).toBeNull();
    expect(countryName(null)).toBeNull();
    expect(subdivisionName('CA', 'ON')).toBe('Ontario');
    expect(subdivisionName('US', 'ON')).toBeNull();
    expect(subdivisionName('US', null)).toBeNull();
  });
});
