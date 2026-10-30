/** Plan 05.3-42: value card (L2, D-18): stored to value.* and 'L2.alternative' only, and the stored-only note. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { CheckV2 } from '@/engine/decide/v3';
import { emptyCheck } from '../../model/checkEdits';
import { ValueCard } from '../ValueCard';
import { Stateful } from './harness';

jest.setTimeout(60000);

jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));

function mount(onCheck: (c: CheckV2) => void) {
  return render(
    <Stateful initial={emptyCheck()} onCheck={onCheck}>
      {({ check, edit }) => <ValueCard check={check} edit={edit} currency="USD" />}
    </Stateful>,
  );
}

describe('ValueCard', () => {
  it('writes the monthly figure, the years and the alternative, and only to value and L2.*', async () => {
    let latest = emptyCheck();
    await mount((c) => { latest = c; });
    await fireEvent.changeText(screen.getByLabelText('It earns or saves me (a month), optional'), '40');
    expect(latest.value.earnsMonthly).toBe(4000);
    await fireEvent.press(screen.getByText('5 yrs'));
    expect(latest.value.useYears).toBe(5);
    await fireEvent.press(screen.getByText('Used or refurbished'));
    expect(latest.layerAnswers['L2.alternative']).toBe('used');
    expect(latest.extras).toEqual({});
    expect(latest.price).toBeNull();
  });

  it('A cheaper one reveals Their price and writes value.cheaperPrice', async () => {
    let latest = emptyCheck();
    await mount((c) => { latest = c; });
    expect(screen.queryByLabelText('Their price')).toBeNull();
    await fireEvent.press(screen.getByText('A cheaper one'));
    await fireEvent.changeText(screen.getByLabelText('Their price'), '250');
    expect(latest.value.cheaperPrice).toBe(25000);
  });

  it('says the answers are kept for records', async () => {
    await mount(() => undefined);
    expect(screen.getByText('Kept with this check for your records.')).toBeTruthy();
  });
});
