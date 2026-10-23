import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { Assessment } from '@/engine/decide';
import * as textFit from '../../ui/textFit';
import { LedgersBody } from '../sections/LedgersSection';
import { MonthBody } from '../sections/MonthSection';
import { AssumptionsBody } from '../sections/AssumptionsSection';
import { ref } from '../../copy/types';
import { TableRow, type SectionBodyProps } from '../sections/sectionUi';
import { buy, exact, stepProps, whole, wrap } from '../steps/__tests__/helpers/stepProps';
import { META, loggedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
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

describe('Month body', () => {
  afterEach(() => jest.restoreAllMocks());

  it('keeps three columns when there is room', async () => {
    await wrap(<MonthBody {...bodyProps()} />);
    expect(screen.getByText('Line')).toBeTruthy();
    expect(screen.getByText('Now')).toBeTruthy();
    expect(screen.getByText('After')).toBeTruthy();
  });

  it('D-76 the month table stacks below 360 wide', async () => {
    jest.spyOn(textFit, 'useShouldStack').mockReturnValue(true);
    await wrap(<MonthBody {...bodyProps()} />);
    expect(screen.queryByText('Line')).toBeNull();
    expect(screen.getByText('Now $5000.00 · After $5000.00')).toBeTruthy();
    expect(screen.getByLabelText(/^Money in, Now \$5000\.00, After \$5000\.00$/)).toBeTruthy();
  });
});

describe('Assumptions body', () => {
  afterEach(() => jest.restoreAllMocks());
  const asProps = (extra: Record<string, unknown> = {}) => ({ ...bodyProps(), meta: { ...META, unconvertedRows: 2, derivedDebts: 1 }, ...extra });

  it('D-75 Assumptions shows 5 rows, then Show details', async () => {
    await wrap(<AssumptionsBody {...asProps()} />);
    expect(screen.getByText('Lines without a rate')).toBeTruthy();
    expect(screen.queryByText('1 balance counted as debt')).toBeNull();
    await fireEvent.press(screen.getByText('Show details'));
    expect(screen.getByText('1 balance counted as debt')).toBeTruthy();
    expect(screen.getByText('Hide details')).toBeTruthy();
  });

  it('D-70 the provisional rate row carries its ⓘ', async () => {
    const basisItems = [ref('decide.depth.currency.provisional', { count: 2, date: '2026-10-14' })];
    await wrap(<AssumptionsBody {...asProps({ basisItems })} />);
    // six rows before it: the row is moved into the visible five, never hidden behind Show details
    expect(screen.getAllByLabelText(/^About /)).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText(/^About /));
    expect(screen.getByText(/dated 2026-10-14/)).toBeTruthy();
  });
});
