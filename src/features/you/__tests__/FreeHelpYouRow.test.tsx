// 09-15 (D-03, T-09-55): the Free help row and screen never read plan state. usePlanState throws here; they must still render.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';

jest.mock('@/features/plans/usePlanState', () => ({
  usePlanState: () => {
    throw new Error('Free help must not read plan state');
  },
}));
jest.mock('@/features/levels/useFeatureAccess', () => ({ useAllFeatureAccess: () => [], useUserSetup: () => ({ data: null, loading: false }) }));
let mockRegion: string | null = 'GB';
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ region: mockRegion }) }));
jest.mock('@/services/locale/deviceLocale', () => ({ getDeviceRegion: () => null }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn() }) }));
jest.mock('@/shell/header/BackButton', () => ({ BackButton: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { FreeHelpYouRow } from '../components/PlanYouRows';
import { FreeHelpScreen } from '@/features/plans/FreeHelpScreen';

jest.setTimeout(30000);

describe('Free help', () => {
  it('the You row renders and presses without plan state', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider>
        <FreeHelpYouRow tile={null} onPress={onPress} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Free help')).toBeTruthy();
    expect(screen.getByText('Free money help and debt support links')).toBeTruthy();
    await fireEvent.press(screen.getByText('Free help'));
    expect(onPress).toHaveBeenCalled();
  });

  it('the screen lists the region entry and opens its https link', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(
      <ThemeProvider>
        <FreeHelpScreen />
      </ThemeProvider>,
    );
    expect(screen.getByText('MoneyHelper')).toBeTruthy();
    expect(screen.queryByText('NFCC')).toBeNull();
    await fireEvent.press(screen.getByText('MoneyHelper'));
    expect(open).toHaveBeenCalledWith('https://www.moneyhelper.org.uk');
  });

  it('lists every entry when the country has none', async () => {
    mockRegion = 'FR';
    await render(
      <ThemeProvider>
        <FreeHelpScreen />
      </ThemeProvider>,
    );
    for (const name of ['MoneyHelper', 'NFCC', 'Credit Counselling Canada']) expect(screen.getByText(name)).toBeTruthy();
  });
});
