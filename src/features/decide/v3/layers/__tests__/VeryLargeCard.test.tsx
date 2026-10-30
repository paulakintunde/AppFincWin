/** Plan 05.3-42: very large purchase card (L7, D-18): sources, staged payments, the user's own statement; L7.* only. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { CheckV2 } from '@/engine/decide/v3';
import { emptyCheck } from '../../model/checkEdits';
import { VeryLargeCard } from '../VeryLargeCard';
import { Stateful } from './harness';

jest.setTimeout(60000);

jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));

function mount(stagedRequired: boolean, onCheck: (c: CheckV2) => void) {
  return render(
    <Stateful initial={emptyCheck()} onCheck={onCheck}>
      {({ check, edit }) => <VeryLargeCard check={check} edit={edit} currency="USD" stagedRequired={stagedRequired} />}
    </Stateful>,
  );
}

describe('VeryLargeCard', () => {
  it('adds a source row and a payment row, and stores them under L7.*', async () => {
    let latest = emptyCheck();
    await mount(false, (c) => { latest = c; });
    await fireEvent.press(screen.getByLabelText('+ Add a source'));
    await fireEvent.changeText(screen.getByTestId('source-name-0'), 'Savings');
    await fireEvent.changeText(screen.getAllByLabelText('Amount')[0]!, '5000');
    await fireEvent.press(screen.getByLabelText('+ Add a payment'));
    await fireEvent.changeText(screen.getByTestId('stage-date-0'), '2027-01-15');
    expect(latest.layerAnswers['L7.sources']).toEqual([{ source: 'Savings', amount: 500000 }]);
    expect(latest.layerAnswers['L7.stages']).toEqual([{ date: '2027-01-15', amount: null }]);
    expect(latest.extras).toEqual({});
  });

  it('shows the staged-payments requirement when required', async () => {
    await mount(true, () => undefined);
    expect(screen.getByText('Staged payments are needed at this size.')).toBeTruthy();
  });

  it('does not show the requirement when it is not required', async () => {
    await mount(false, () => undefined);
    expect(screen.queryByText('Staged payments are needed at this size.')).toBeNull();
  });

  it('the professional switch is a switch that writes L7.professional', async () => {
    let latest = emptyCheck();
    await mount(false, (c) => { latest = c; });
    await fireEvent.press(screen.getByRole('switch', { name: 'I’ve talked this over with a professional' }));
    expect(latest.layerAnswers['L7.professional']).toBe(true);
    expect(screen.getByText('Kept with this check for your records.')).toBeTruthy();
  });
});
