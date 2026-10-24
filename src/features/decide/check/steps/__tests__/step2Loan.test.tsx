// 05-101 (D-86, R16.2): the deposit's interest saving, its inline line, and top-aligned captions.
import React from 'react';
import { StyleSheet } from 'react-native';
import { screen } from '@testing-library/react-native';
import { MethodPanels } from '../step2/MethodPanels';
import { FigureStrip } from '../../../ui/FigureStrip';
import { computeCheck } from '../../../snapshot/computeCheck';
import type { CheckInputs } from '../../../snapshot/types';
import { EMPTY_STACK } from '../../../snapshot/types';
import { TODAY, loggedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import { buy, exact, whole, wrap } from './helpers/stepProps';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const source = loggedSource();

function loan(patch: Partial<CheckInputs['loan']>): CheckInputs {
  const base = buy({ method: 'loan' });
  return { ...base, loan: { ...base.loan, termMonths: 24, ...patch } };
}

async function mount(inputs: CheckInputs) {
  return wrap(
    <MethodPanels
      inputs={inputs}
      update={jest.fn()}
      computation={computeCheck(source, inputs)}
      source={source}
      goToStep={jest.fn()}
      whole={whole}
      exact={exact}
      today={TODAY}
      readOnly={false}
      stack={EMPTY_STACK}
      onSaveCardRate={jest.fn()}
      onSaveCardTerms={jest.fn()}
    />,
  );
}

describe('LoanPanel interest saved (D-86)', () => {
  it('D-86 a deposit shows the interest it saves and the line', async () => {
    await mount(loan({ aprText: '10', deposit: 50_000 }));
    expect(screen.getByText('Interest saved by the deposit')).toBeTruthy();
    expect(screen.getByText('Interest paid')).toBeTruthy();
    expect(screen.getByText('Cash left after')).toBeTruthy();
    expect(screen.queryByText('Interest saved')).toBeNull();
    expect(screen.getByText(/less interest than borrowing the full .* with no deposit\. The deposit lowers the amount borrowed to .* over the same 24\s+months at 10%\./)).toBeTruthy();
    expect(screen.getAllByLabelText(/Interest saved by the deposit/).length).toBeGreaterThan(0); // the strip group and the ⓘ button
  });

  it('D-86 no deposit or 0% hides the saving', async () => {
    const view = await mount(loan({ aprText: '10', deposit: 0 }));
    expect(screen.queryByText('Interest saved by the deposit')).toBeNull();
    expect(screen.queryByText(/less interest than borrowing/)).toBeNull();
    expect(screen.getByText('Interest paid')).toBeTruthy();
    await view.unmount();
    await mount(loan({ aprText: '0', deposit: 50_000 }));
    expect(screen.queryByText('Interest saved by the deposit')).toBeNull();
    expect(screen.queryByText(/less interest than borrowing/)).toBeNull();
    expect(screen.getByText('None')).toBeTruthy();
  });

  it('D-86 captions stay top-aligned', async () => {
    await wrap(<FigureStrip items={[{ caption: 'A long two line caption', value: '$1' }, { caption: 'Short', value: '$2' }]} />);
    const cell = screen.getByLabelText('Short, $2');
    const row = cell.parent;
    expect(StyleSheet.flatten(row?.props.style)).toMatchObject({ flexDirection: 'row', alignItems: 'flex-start' });
  });
});
