import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { CurrencyOption } from '@/data/queries/currencyOptions';
import { CurrencyPicker } from '../pickers/CurrencyPicker';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.setTimeout(30000);

const opt = (code: string, name: string): CurrencyOption => ({ code, name, symbol: null, exponent: 2, kind: 'iso', rateDate: null });
const OPTIONS = [
  opt('AUD', 'Australian Dollar'),
  opt('DKK', 'Danish Krone'),
  opt('EUR', 'Euro'),
  opt('GBP', 'Pound Sterling'),
  opt('USD', 'US Dollar'),
];

async function setup(selected = 'GBP', home = 'GBP') {
  const onSelect = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <CurrencyPicker
        visible
        title="Currency"
        options={OPTIONS}
        homeCurrency={home}
        selected={selected}
        onSelect={onSelect}
        onClose={jest.fn()}
      />
    </ThemeProvider>
  );
  return { ...utils, onSelect };
}

describe('CurrencyPicker', () => {
  it('shows Your currency, Popular continents, then All currencies as headers', async () => {
    const { getAllByRole } = await setup();
    const headers = getAllByRole('header').map((h) => h.props.children);
    expect(headers).toEqual(
      expect.arrayContaining(['Your currency', 'Popular', 'North America', 'Europe', 'Oceania', 'All currencies'])
    );
    expect(headers.indexOf('Your currency')).toBeLessThan(headers.indexOf('Popular'));
    expect(headers.indexOf('Popular')).toBeLessThan(headers.indexOf('All currencies'));
    expect(headers).not.toContain('Asia');
  });

  it('lists the home currency alone under Your currency and not in Popular', async () => {
    const { getByTestId } = await setup();
    const homeBlock = getByTestId('currency-section-home');
    expect(within(homeBlock).getAllByLabelText(/·/)).toHaveLength(1);
    expect(within(homeBlock).getByLabelText('GBP · Pound Sterling')).toBeTruthy();
    expect(within(getByTestId('currency-section-popular')).queryByLabelText('GBP · Pound Sterling')).toBeNull();
  });

  it('keeps every currency in All currencies, A-Z', async () => {
    const { getByTestId } = await setup();
    const all = within(getByTestId('currency-section-all'))
      .getAllByLabelText(/·/)
      .map((n) => n.props.accessibilityLabel);
    expect(all).toEqual(OPTIONS.map((o) => `${o.code} · ${o.name}`));
  });

  it('selects by code, from any section', async () => {
    const { getByTestId, onSelect } = await setup();
    await fireEvent.press(within(getByTestId('currency-section-popular')).getByLabelText('USD · US Dollar'));
    expect(onSelect).toHaveBeenCalledWith('USD');
  });
});
