import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import type { Assessment, Verdict } from '@/engine/decide';
import * as textFit from '../../ui/textFit';
import { WarningList, WarningRows, warnCardsOf } from '../WarningList';
import { WhatBreaksBody } from '../sections/WhatBreaksSection';
import type { SectionProps } from '../sections/sectionUi';
import { buy, exact, stepProps, whole, wrap } from '../steps/__tests__/helpers/stepProps';
import { loggedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import type { CheckInputs } from '../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const FITS: Partial<CheckInputs> = { advertised: 150_000, method: 'cash' };
const BREAKS: Partial<CheckInputs> = { advertised: 1_150_000, method: 'cash' };

function props(over: Partial<CheckInputs>): Omit<SectionProps, 'expanded' | 'onToggle'> {
  const p = stepProps(buy(over), {}, loggedSource());
  return { computation: p.computation, inputs: p.inputs, update: jest.fn(), whole, exact, currency: 'USD', readOnly: false };
}

const fmt = (n: number) => `$${Math.round(n / 100)}`;
const fmtDate = (d: string) => d;
const assessmentOf = (p: { computation: { verdict: unknown } }) => p.computation.verdict as Assessment;

describe('What breaks', () => {
  afterEach(() => jest.restoreAllMocks());

  it('D-74 What breaks lists every warning as a row, largest first', async () => {
    const p = props(BREAKS);
    const a = assessmentOf(p);
    expect(a.warnings.length).toBeGreaterThan(0);
    for (let i = 1; i < a.warnings.length; i += 1) expect(a.warnings[i - 1]!.shortfall).toBeGreaterThanOrEqual(a.warnings[i]!.shortfall);
    await wrap(<WarningRows verdict={a} fmt={fmt} fmtDate={fmtDate} />);
    // T-05-64-01: the same cards in the same order as the cards the list drew before
    const expected = warnCardsOf(a, null, fmt, fmtDate);
    expect(expected.length).toBe(a.warnings.length);
    const rows = screen.getAllByLabelText(/, .*\. /);
    expect(rows).toHaveLength(expected.length);
    expect(screen.getByText('Cash cushion broken')).toBeTruthy();
  });

  it('D-74 with warnings Every line sits behind Show details', async () => {
    await wrap(<WhatBreaksBody {...props(BREAKS)} />);
    expect(screen.queryByText('Every line')).toBeNull();
    expect(screen.queryByText('Cash cushion')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Show details, Every line'));
    expect(screen.getByText('Every line')).toBeTruthy();
    expect(screen.getByText('Cash cushion')).toBeTruthy();
    expect(screen.getByLabelText('Hide details, Every line')).toBeTruthy();
  });

  it('D-74 with nothing breaking Every line shows at once', async () => {
    const p = props(FITS);
    expect(assessmentOf(p).warnings).toHaveLength(0);
    await wrap(<WhatBreaksBody {...p} />);
    expect(screen.getByText('Every line')).toBeTruthy();
    expect(screen.getByText('Cash cushion')).toBeTruthy();
    expect(screen.queryByLabelText(/^Show details/)).toBeNull();
  });

  it('R2 a long warning value stacks under its title', async () => {
    const a = assessmentOf(props(BREAKS));
    const valueText = fmt(a.warnings[0]!.shortfall);
    const align = () => StyleSheet.flatten(screen.getByText(new RegExp(`${valueText.replace('$', '\\$')}$`)).props.style).textAlign;
    const view = await wrap(<WarningRows verdict={a} fmt={fmt} fmtDate={fmtDate} />);
    expect(align()).toBe('right');
    await view.unmount();
    jest.spyOn(textFit, 'useShouldStack').mockReturnValue(true);
    await wrap(<WarningRows verdict={a} fmt={fmt} fmtDate={fmtDate} />);
    expect(align()).toBe('left');
  });

  it('D-70 every line row carries its ⓘ', async () => {
    await wrap(<WhatBreaksBody {...props(FITS)} />);
    // five of the six rows: the month row has none
    expect(screen.getAllByLabelText(/^About /)).toHaveLength(5);
  });

  it('D-70 the dsr, owe and inv warning rows carry their ⓘ', async () => {
    const a = assessmentOf(props(FITS));
    const v = {
      ...a,
      warnings: [
        { code: 'dsr', shortfall: 3 },
        { code: 'owe', shortfall: 2 },
        { code: 'inv', shortfall: 1 },
      ],
    } as unknown as Verdict;
    await wrap(<WarningRows verdict={v} fmt={fmt} fmtDate={fmtDate} />);
    expect(screen.getAllByLabelText(/^About /)).toHaveLength(3);
  });

  it('R2 notices-only mode renders no warnings', async () => {
    const a = assessmentOf(props(BREAKS));
    const view = await wrap(<WarningList verdict={a} fmt={fmt} fmtDate={fmtDate} warnings={false} />);
    expect(screen.queryByText('Cash cushion broken')).toBeNull();
    await view.unmount();
    await wrap(<WarningList verdict={a} fmt={fmt} fmtDate={fmtDate} />);
    expect(screen.getByText('Cash cushion broken')).toBeTruthy();
  });
});
