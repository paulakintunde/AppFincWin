/** Plan 05.3-42: major asset card (L6, D-18): L6.* only, and no double count with the property preset's costs. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { CheckV2, V3PresetItemType } from '@/engine/decide/v3';
import { toStoredV2 } from '@/engine/decide/v3';
import { emptyCheck, withItemType } from '../../model/checkEdits';
import { MajorAssetCard } from '../MajorAssetCard';
import { Stateful } from './harness';

jest.setTimeout(60000);

jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));

function mount(type: V3PresetItemType, onCheck: (c: CheckV2) => void) {
  return render(
    <Stateful initial={withItemType(emptyCheck(), { kind: 'preset', value: type })} onCheck={onCheck}>
      {({ check, edit }) => <MajorAssetCard check={check} edit={edit} currency="USD" />}
    </Stateful>,
  );
}

describe('MajorAssetCard', () => {
  it('vehicle: all six fields, each stored under L6.* with extras untouched', async () => {
    let latest = withItemType(emptyCheck(), { kind: 'preset', value: 'vehicle' });
    const extrasBefore = toStoredV2(latest).extras;
    await mount('vehicle', (c) => { latest = c; });
    await fireEvent.press(screen.getByText('Selling something'));
    await fireEvent.changeText(screen.getByLabelText('Legal and closing costs'), '1200');
    await fireEvent.changeText(screen.getByLabelText('Moving costs'), '300');
    await fireEvent.press(screen.getByText('3 yrs'));
    await fireEvent.changeText(screen.getByLabelText('New bills each month'), '80');
    await fireEvent.changeText(screen.getByLabelText('Bills that stop each month'), '20');
    expect(latest.layerAnswers).toEqual({
      'L6.depositFrom': 'selling', 'L6.closing': 120000, 'L6.moving': 30000, 'L6.keepYears': 3, 'L6.newBills': 8000, 'L6.stopBills': 2000,
    });
    expect(toStoredV2(latest).extras).toEqual(extrasBefore);
    expect(screen.queryByText('Asked under item costs above.')).toBeNull();
    expect(screen.getByText('Kept with this check for your records.')).toBeTruthy();
  });

  it('property: no closing or moving input (the preset asks them), the note shows', async () => {
    await mount('property', () => undefined);
    expect(screen.queryByLabelText('Legal and closing costs')).toBeNull();
    expect(screen.queryByLabelText('Moving costs')).toBeNull();
    expect(screen.getByText('Asked under item costs above.')).toBeTruthy();
    expect(screen.getByLabelText('New bills each month')).toBeTruthy();
    expect(screen.getByText('Kept with this check for your records.')).toBeTruthy();
  });
});
