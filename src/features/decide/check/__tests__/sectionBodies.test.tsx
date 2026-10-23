import React from 'react';
import { screen } from '@testing-library/react-native';
import type { Assessment } from '@/engine/decide';
import { LedgersBody } from '../sections/LedgersSection';
import { TableRow, type SectionBodyProps } from '../sections/sectionUi';
import { buy, exact, stepProps, whole, wrap } from '../steps/__tests__/helpers/stepProps';
import { loggedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import type { CheckInputs } from '../../snapshot/types';

jest.setTimeout(30000);

const FITS: Partial<CheckInputs> = { advertised: 150_000, method: 'cash' };

function bodyProps(over: Partial<CheckInputs> = FITS): SectionBodyProps {
  const p = stepProps(buy(over), {}, loggedSource());
  return { computation: p.computation, inputs: p.inputs, update: jest.fn(), whole, exact, currency: 'USD', readOnly: false };
}
const assessment = (p: SectionBodyProps): Assessment => p.computation.verdict as Assessment;

describe('Where it lands body', () => {
  it('D-76 Where it lands has no arrow and reads now and after', async () => {
    const p = bodyProps();
    await wrap(<LedgersBody {...p} />);
    expect(screen.queryByText(/→/)).toBeNull();
    expect(screen.getAllByText('Now').length).toBe(assessment(p).ledgers.length);
    expect(screen.getAllByText('After').length).toBe(assessment(p).ledgers.length);
  });

  it('D-76 Where it lands stacks Now and After at fontScale 2', async () => {
    const p = bodyProps();
    await wrap(<LedgersBody {...p} />, 2);
    // stacked: every ledger keeps both figures and its words-only label
    expect(screen.getAllByLabelText(/, now .+, after .+, (Better|Worse|Same)$/).length).toBe(assessment(p).ledgers.length);
  });

  it('R6 the ledger group reads now, after and direction', async () => {
    const p = bodyProps();
    await wrap(<LedgersBody {...p} />);
    const l = assessment(p).ledgers.find((x) => x.code === 'debt')!;
    const money = (n: number) => `$${(n / 100).toFixed(2)}`;
    const word = { better: 'Better', worse: 'Worse', same: 'Same' }[l.direction];
    expect(screen.getByLabelText(`Debt, now ${money(l.now)}, after ${money(l.after)}, ${word}`)).toBeTruthy();
  });
});

describe('Shared TableRow', () => {
  it('D-76 a table row stacks a long value under its label', async () => {
    await wrap(<TableRow label="Short label" value="A value that is far too long to sit beside" />);
    const label = screen.getByText('Short label');
    const value = screen.getByText('A value that is far too long to sit beside');
    // stacked: the value is not in the label's row container, it is left aligned
    expect(value.props.style).toEqual(expect.objectContaining({ textAlign: 'left' }));
    expect(label).toBeTruthy();
  });

  it('keeps the value on the right when it is short', async () => {
    await wrap(<TableRow label="Label" value="$5" />);
    expect(screen.getByText('$5').props.style).toEqual(expect.objectContaining({ textAlign: 'right' }));
  });
});
