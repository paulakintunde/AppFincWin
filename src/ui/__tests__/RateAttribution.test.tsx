import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { RateAttribution } from '../RateAttribution';
import { ThemeProvider } from '@/theme/ThemeProvider';

jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }),
}));

async function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('RateAttribution', () => {
  it('renders the publication date for a frankfurter-v2 rate', async () => {
    const { getByText } = await renderWithTheme(
      <RateAttribution rateDate="2026-09-21" rateSource="frankfurter-v2" ratePending={false} />
    );
    expect(getByText('Rate of Sep 21, 2026')).toBeTruthy();
  });

  it('renders the open.er-api attribution as a pressable link and opens the URL on press', async () => {
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByText, getByRole } = await renderWithTheme(
      <RateAttribution rateDate="2026-09-21" rateSource="open-er-api" ratePending={false} />
    );
    expect(getByText('Rate of Sep 21, 2026')).toBeTruthy();
    expect(getByText('Rates By Exchange Rate API')).toBeTruthy();

    const link = getByRole('link');
    fireEvent.press(link);

    await waitFor(() => expect(openURLSpy).toHaveBeenCalledWith('https://www.exchangerate-api.com'));
  });

  it('renders "Your rate, set <date>" for a custom rate', async () => {
    const { getByText } = await renderWithTheme(
      <RateAttribution rateDate="2026-09-20" rateSource="custom" ratePending={false} />
    );
    expect(getByText('Your rate, set Sep 20, 2026')).toBeTruthy();
  });

  it('renders "Rate pending" with no date while pending', async () => {
    const { getByText, queryByText } = await renderWithTheme(
      <RateAttribution rateDate={null} rateSource="frankfurter-v2" ratePending={true} />
    );
    expect(getByText('Rate pending')).toBeTruthy();
    expect(queryByText(/Rate of/)).toBeNull();
  });

  it('renders nothing for a same-currency figure', async () => {
    const { toJSON } = await renderWithTheme(
      <RateAttribution rateDate={null} rateSource="same-currency" ratePending={false} />
    );
    expect(toJSON()).toBeNull();
  });
});
