// 10-review (D-4): the threshold field never shows a saved amount under the wrong currency, and blur saves only a change.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { AlertSetting } from '@/db/alerts';
import { minorUnits } from '@/engine/money';
import { AlertKindSheet } from '../AlertKindSheet';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.setTimeout(120000);

const LABEL = 'Large transaction, Amount';

function setting(over: Partial<AlertSetting>): AlertSetting {
  return { kind: 'large_txn', enabled: true, thresholdMinor: null, thresholdCurrency: null, leadDays: null, version: 0, ...over } as AlertSetting;
}

async function open(s: AlertSetting, onSave = jest.fn()) {
  await render(
    <ThemeProvider>
      <AlertKindSheet
        kind="large_txn"
        setting={s}
        suggested={{ minor: minorUnits(60000), basis: 'history' }}
        homeCurrency="USD"
        formatMoney={(m) => `${m.currency} ${m.amount}`}
        onToggle={jest.fn()}
        onSave={onSave}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  );
  return onSave;
}

describe('AlertKindSheet threshold (10-review D-4)', () => {
  it('a saved amount in another currency starts from the home suggestion and is not saved on a bare blur', async () => {
    const onSave = await open(setting({ thresholdMinor: 25000, thresholdCurrency: 'EUR' }));
    const field = screen.getByLabelText(LABEL);
    expect(field.props.value).toBe('600');
    await fireEvent(field, 'blur');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a saved home-currency amount starts the field, and an unchanged blur saves nothing', async () => {
    const onSave = await open(setting({ thresholdMinor: 25000, thresholdCurrency: 'USD' }));
    const field = screen.getByLabelText(LABEL);
    expect(field.props.value).toBe('250');
    await fireEvent(field, 'blur');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('an edited amount saves on blur in the home currency', async () => {
    const onSave = await open(setting({ thresholdMinor: 25000, thresholdCurrency: 'EUR' }));
    const field = screen.getByLabelText(LABEL);
    await fireEvent.changeText(field, '300');
    await fireEvent(field, 'blur');
    expect(onSave).toHaveBeenCalledWith('large_txn', { thresholdMinor: 30000, thresholdCurrency: 'USD' });
  });
});
