import React from 'react';
import { screen } from '@testing-library/react-native';
import type { Assessment, MonthColumn } from '@/engine/decide';
import { MonthBody } from '../sections/MonthSection';
import type { SectionProps } from '../sections/sectionUi';
import { buy, exact, stepProps, whole, wrap } from '../steps/__tests__/helpers/stepProps';
import { loggedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';

jest.setTimeout(30000);

function props(setAside: { now: number; after: number }): SectionProps {
  const p = stepProps(buy({ advertised: 150_000, method: 'cash' }), {}, loggedSource());
  const a = p.computation.verdict as Assessment;
  const col = (c: MonthColumn, pots: number): MonthColumn => ({ ...c, setAside: pots as MonthColumn['setAside'], outgoings: (c.outgoings + pots) as MonthColumn['outgoings'], left: (c.left - pots) as MonthColumn['left'] });
  const monthTable = { now: col(a.monthTable.now, setAside.now), after: col(a.monthTable.after, setAside.after) };
  return {
    computation: { ...p.computation, verdict: { ...a, monthTable } as Assessment },
    inputs: p.inputs,
    update: jest.fn(),
    whole,
    exact,
    currency: 'USD',
    readOnly: false,
  };
}

describe('MonthBody pots row (D-101)', () => {
  it('D-101 the month table shows Set aside for pots only above zero and still adds up', async () => {
    const p = props({ now: 20_000, after: 20_000 });
    await wrap(<MonthBody {...p} />);
    expect(screen.getByLabelText(/^Set aside for pots, Now \$200\.00, After \$200\.00$/)).toBeTruthy();
    const { now, after } = (p.computation.verdict as Assessment).monthTable;
    for (const c of [now, after]) {
      expect(c.living + c.debtPayments + c.savingInvesting + c.setAside + c.thisPurchase).toBe(c.outgoings);
      expect(c.income - c.outgoings).toBe(c.left);
    }
    // between Saving and investing and This purchase
    const labels = screen.getAllByLabelText(/, Now \$.*, After \$/).map((n) => String(n.props.accessibilityLabel).split(',')[0]);
    const i = labels.indexOf('Set aside for pots');
    expect(labels[i - 1]).toBe(screen.getByLabelText(/^Saving and investing, /).props.accessibilityLabel.split(',')[0]);
    expect(labels[i + 1]).toBe(screen.getByLabelText(/^Running costs of this, /).props.accessibilityLabel.split(',')[0]);
  });

  it('D-101 the row is hidden at zero in both columns', async () => {
    await wrap(<MonthBody {...props({ now: 0, after: 0 })} />);
    expect(screen.queryByLabelText(/^Set aside for pots/)).toBeNull();
  });

  it('D-101 a set-aside in one column alone keeps the row', async () => {
    await wrap(<MonthBody {...props({ now: 0, after: 5_000 })} />);
    expect(screen.getByLabelText(/^Set aside for pots, Now \$0\.00, After \$50\.00$/)).toBeTruthy();
  });
});
