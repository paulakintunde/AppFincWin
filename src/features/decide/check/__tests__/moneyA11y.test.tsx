import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import * as deviceLocale from '@/services/locale/deviceLocale';
import { MoneyInput } from '../../ui/MoneyInput';
import { WarningCard } from '../../ui/WarningCard';
import { refText, refTextA11y, type Translate } from '../refText';
import { moneyA11yFn } from '../steps/stepUi';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { currencyCode } from '@/engine/money';

jest.setTimeout(30000);

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const t: Translate = (key, params) => `${key}:${Object.entries(params ?? {}).map(([k, v]) => `${k}=${v}`).join(',')}`;

function Probe({ onFmt }: { onFmt: (f: ReturnType<typeof useMoneyFormatter>) => void }) {
  onFmt(useMoneyFormatter(false, 'CAD'));
  return null;
}

describe('D-94 money read aloud', () => {
  beforeEach(() => {
    jest.spyOn(deviceLocale, 'useDeviceLocale').mockReturnValue({ locale: 'en-CA' } as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it('D-94 Decide figures read currency names', async () => {
    const view = await wrap(<MoneyInput compact value={150000} currency="CAD" onChange={() => undefined} label="Deposit" accessibilityLabel="Deposit amount" />);
    expect(view.getByLabelText('Deposit amount').props.accessibilityValue).toEqual({ text: '1,500 Canadian dollars' });
    let fmt: ReturnType<typeof useMoneyFormatter> | undefined;
    await wrap(<Probe onFmt={(f) => (fmt = f)} />);
    expect(moneyA11yFn(fmt!, currencyCode('USD'))(150000)).toBe('1,500 US dollars');
    expect(moneyA11yFn(fmt!, currencyCode('CAD'))(150000)).toBe('1,500 Canadian dollars');
  });

  it('D-94 sentences built from amounts read currency names', async () => {
    const visible = { key: 'decide.warn.x', params: { amount: 'CA$1,500', days: 3 } };
    expect(refText(t, visible)).toBe('decide.warn.x:amount=CA$1,500,days=3');
    expect(refTextA11y(t, visible, { amount: '1,500 Canadian dollars' })).toBe('decide.warn.x:amount=1,500 Canadian dollars,days=3');
    expect(refTextA11y(t, { key: 'k' })).toBe('k:');
    const view = await wrap(
      <WarningCard tone="hard" title="This month" value="CA$50" body={['Short by CA$50.']} a11yLabel="This month, 50 Canadian dollars. Short by 50 Canadian dollars." />,
    );
    expect(view.getByLabelText('This month, 50 Canadian dollars. Short by 50 Canadian dollars.')).toBeTruthy();
    expect(view.getByText('CA$50')).toBeTruthy();
  });
});
