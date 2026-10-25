import React from 'react';
import { screen } from '@testing-library/react-native';
import { AssumptionsBody } from '../AssumptionsSection';
import { buy, exact, stepProps, whole, wrap } from '../../steps/__tests__/helpers/stepProps';
import { META, loggedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import type { CheckInputs } from '../../../snapshot/types';
import type { SectionProps } from '../sectionUi';

jest.setTimeout(30000);

function props(over: Partial<CheckInputs> = {}, housingMonthly = 150_000) {
  const p = stepProps(buy({ advertised: 150_000, method: 'cash', ...over }), {}, loggedSource({ housingMonthly: housingMonthly as never }));
  const section: SectionProps = { computation: p.computation, inputs: p.inputs, update: jest.fn(), whole, exact, currency: 'USD', readOnly: false };
  return { ...section, meta: META };
}

describe('Assumptions in play (D-103)', () => {
  it('D-103 Assumptions shows housing costs today for property checks only', async () => {
    await wrap(<AssumptionsBody {...props({ itemType: 'property', itemTypeTouched: true })} />);
    expect(screen.getByText('Housing costs today')).toBeTruthy();
    expect(screen.getByText('$1500 a month')).toBeTruthy();
    await screen.unmount();
    await wrap(<AssumptionsBody {...props()} />);
    expect(screen.queryByText('Housing costs today')).toBeNull();
  });
});
