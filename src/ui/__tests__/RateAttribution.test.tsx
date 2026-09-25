import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { RateAttribution } from '../RateAttribution';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize } from '@/theme/typography';

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

  it('handles an openURL rejection (no browser available) without an unhandled rejection', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const openURLSpy = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No Activity found'));
      const { getByRole } = await renderWithTheme(
        <RateAttribution rateDate="2026-09-21" rateSource="open-er-api" ratePending={false} />
      );
      fireEvent.press(getByRole('link'));
      await waitFor(() => expect(openURLSpy).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('gives the attribution link a tap target of at least space.touchMin', async () => {
    const { getByRole } = await renderWithTheme(
      <RateAttribution rateDate="2026-09-21" rateSource="open-er-api" ratePending={false} />
    );
    const hitSlop = getByRole('link').props.hitSlop as { top: number; bottom: number } | undefined;
    expect(hitSlop).toBeDefined();
    expect(fontSize.meta + (hitSlop?.top ?? 0) + (hitSlop?.bottom ?? 0)).toBeGreaterThanOrEqual(space.touchMin);
  });

  it('does not put a combined label on the row, so the attribution is read once', async () => {
    const { queryByLabelText, getByLabelText } = await renderWithTheme(
      <RateAttribution rateDate="2026-09-21" rateSource="open-er-api" ratePending={false} />
    );
    expect(queryByLabelText('Rate of Sep 21, 2026. Rates By Exchange Rate API')).toBeNull();
    expect(getByLabelText('Rates By Exchange Rate API')).toBeTruthy();
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

  it('renders "Rate pending", never "Rate of " with no date, when the date is missing', async () => {
    const { getByText, queryByText, queryByRole } = await renderWithTheme(
      <RateAttribution rateDate={null} rateSource="open-er-api" ratePending={false} />
    );
    expect(getByText('Rate pending')).toBeTruthy();
    expect(queryByText(/Rate of/)).toBeNull();
    expect(queryByRole('link')).toBeNull();
  });

  it('renders "Rate pending" when the source is missing', async () => {
    const { getByText, queryByText } = await renderWithTheme(
      <RateAttribution rateDate="2026-09-21" rateSource={null} ratePending={false} />
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
