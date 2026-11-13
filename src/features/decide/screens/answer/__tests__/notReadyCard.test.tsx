// 06.1-44 (G-1, C-1, C-2, A-ANS-3, D-54): the Not ready card names each item with its fix and answers, and offers quick estimates
// only when they can count.
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { ReadinessItem } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { wrap } from '@/test/stepProps';
import { space } from '@/theme/layout';
import { readinessFixRows, type ReadinessFixRow, type WaiverChoice } from '../../logic/readinessFixes';
import { NotReadyCard } from '../StatusCards';

jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));

const ASOF = '2026-11-05';
const item = (over: Partial<ReadinessItem> & Pick<ReadinessItem, 'kind'>): ReadinessItem => ({
  code: 'past_month_missing',
  month: '2026-10',
  seriesId: null,
  envelopeId: null,
  lineId: null,
  name: null,
  amount: null,
  date: null,
  ...over,
});

const ITEMS: Record<string, ReadinessItem> = {
  pay: item({ kind: 'pay', seriesId: 's-pay', name: 'Salary', amount: minorUnits(250000), date: '2026-10-03' }),
  payNoName: item({ kind: 'pay', seriesId: 's-pay', amount: minorUnits(250000), date: '2026-10-03' }),
  bill: item({ kind: 'bill', seriesId: 's-net', lineId: 'l-net', name: 'Netflix', amount: minorUnits(1199), date: '2026-10-03' }),
  billNoName: item({ kind: 'bill', seriesId: 's-net', amount: minorUnits(1199), date: '2026-10-03' }),
  spending: item({ kind: 'spending', month: '2026-10' }),
  spendingNow: item({ kind: 'spending', code: 'activity_not_current', month: '2026-11', date: '2026-11-01' }),
  lateStart: item({ kind: 'late_start', month: '2026-09', date: '2026-09-20' }),
  envelope: item({ kind: 'envelopes', code: 'envelopes_unconfirmed', month: '2026-11', envelopeId: 'g1', name: 'Holiday' }),
};

const months: Record<string, string> = { '2026-09': 'September', '2026-10': 'October', '2026-11': 'November', '2026-12': 'December' };
const fmt = {
  money: (m: number) => `$${(m / 100).toFixed(2)}`,
  date: (d: string) => `D${d.slice(5)}`,
  monthName: (ym: string) => months[ym] ?? ym,
};

/** A press inside an awaited act, so no act overlaps the next render. */
async function press(node: Parameters<typeof fireEvent.press>[0]): Promise<void> {
  await act(async () => {
    fireEvent.press(node);
  });
}

async function card(items: readonly ReadinessItem[], canUseEstimates: boolean) {
  const calls = { fix: [] as ReadinessFixRow[], choice: [] as [ReadinessFixRow, WaiverChoice][], finish: 0, estimates: 0 };
  const rows = readinessFixRows(items, ASOF);
  await wrap(
    <NotReadyCard
      rows={rows}
      canUseEstimates={canUseEstimates}
      asOf={ASOF}
      {...fmt}
      onFix={(r) => calls.fix.push(r)}
      onChoice={(r, c) => calls.choice.push([r, c])}
      onFinishSetup={() => (calls.finish += 1)}
      onFromEstimates={() => (calls.estimates += 1)}
    />
  );
  // The theme provider renders once its stored choices load.
  await screen.findByTestId('answer-not-ready');
  return { calls, rows };
}

describe('the item sentences (C-2)', () => {
  it.each([
    ['pay', 'Salary, $2500.00 on D10-03, isn’t in your records yet.'],
    ['payNoName', 'Income of $2500.00 on D10-03 isn’t in your records yet.'],
    ['bill', 'Netflix, $11.99 due D10-03, isn’t in your records yet.'],
    ['billNoName', 'A bill of $11.99 due D10-03 isn’t in your records yet.'],
    ['spending', 'No everyday spending is recorded for October yet.'],
    ['spendingNow', 'Nothing spent is recorded since D11-01.'],
    ['lateStart', 'September isn’t fully recorded yet.'],
    ['envelope', 'Holiday isn’t linked to an account.'],
  ])('%s reads as one sentence, one accessibility stop', async (key, text) => {
    await card([ITEMS[key] as ReadinessItem], false);
    const node = screen.getByText(text);
    expect(node.props.accessible).toBe(true);
    expect(within(screen.getByTestId('readiness-row-0')).getByText(text)).toBeTruthy();
  });

  it('an envelope with no name still says what is missing', async () => {
    await card([{ ...(ITEMS.envelope as ReadinessItem), name: null }], false);
    expect(screen.getByText('An envelope isn’t linked to an account.')).toBeTruthy();
  });
});

describe('the lead line (owner decision 4)', () => {
  it('one item: "Not ready yet: 1 thing to finish"', async () => {
    await card([ITEMS.bill as ReadinessItem], false);
    expect(screen.getByText('Not ready yet: 1 thing to finish')).toBeTruthy();
  });

  it('several items: the count, then one row each', async () => {
    await card([ITEMS.pay, ITEMS.bill, ITEMS.spending] as ReadinessItem[], false);
    expect(screen.getByText('Not ready yet: 3 things to finish')).toBeTruthy();
    for (const i of [0, 1, 2]) expect(screen.getByTestId(`readiness-row-${i}`)).toBeTruthy();
    expect(screen.queryByTestId('readiness-row-3')).toBeNull();
  });

  it('a brand-new person (no items, estimates can count) never reads "0 things" and gets estimates as the primary (A-ANS-3)', async () => {
    const { calls } = await card([], true);
    expect(screen.queryByText(/0 things/)).toBeNull();
    expect(screen.getByText('Not ready yet')).toBeTruthy();
    await press(screen.getByText('Answer from quick estimates'));
    expect(calls.estimates).toBe(1);
    await press(screen.getByText('Finish setup'));
    expect(calls.finish).toBe(1);
  });
});

describe('quick estimates only when they can count (C-1, F-1)', () => {
  it('with records (canUseEstimates false) the card has no quick-estimates control anywhere', async () => {
    const { calls } = await card([ITEMS.pay, ITEMS.bill] as ReadinessItem[], false);
    expect(screen.queryByText(/quick estimates/i)).toBeNull();
    expect(screen.queryByLabelText(/quick estimates/i)).toBeNull();
    await press(screen.getByText('Finish setup'));
    expect(calls.finish).toBe(1);
    expect(calls.estimates).toBe(0);
  });

  it('with no earlier month, estimates are offered alongside the named items', async () => {
    await card([ITEMS.spendingNow as ReadinessItem], true);
    expect(screen.getByText('Answer from quick estimates')).toBeTruthy();
    expect(screen.getByTestId('answer-not-ready-finish').props.accessibilityRole).toBe('link');
  });
});

describe('fixes and answers', () => {
  it('a bill with a pending line: Records for October, then It didn’t happen / Someone else paid it / Someone else always pays it', async () => {
    const { calls, rows } = await card([ITEMS.bill as ReadinessItem], false);
    const row = within(screen.getByTestId('readiness-row-0'));
    await press(row.getByText('Records for October'));
    expect(calls.fix).toEqual([rows[0]]);
    for (const label of ['It didn’t happen', 'Someone else paid it', 'Someone else always pays it']) expect(row.getByText(label)).toBeTruthy();
    await press(row.getByText('It didn’t happen'));
    expect(calls.choice[0]?.[1]).toEqual({ key: 'markSkipped', waiver: null, lineId: 'l-net' });
    await press(row.getByText('Someone else paid it'));
    expect(calls.choice[1]?.[1].waiver).toEqual({ kind: 'paid_by_other', seriesId: 's-net', date: '2026-10-03' });
  });

  it('a pay with no line: No pay that time and Income comes in elsewhere', async () => {
    await card([ITEMS.pay as ReadinessItem], false);
    const row = within(screen.getByTestId('readiness-row-0'));
    expect(row.getByText('No pay that time')).toBeTruthy();
    expect(row.getByText('Income comes in elsewhere')).toBeTruthy();
  });

  it('spending and a late start name their months', async () => {
    await card([ITEMS.spending, ITEMS.lateStart] as ReadinessItem[], false);
    expect(within(screen.getByTestId('readiness-row-0')).getByText('Nothing more for October')).toBeTruthy();
    expect(within(screen.getByTestId('readiness-row-1')).getByText('Records begin in October')).toBeTruthy();
    expect(within(screen.getByTestId('readiness-row-1')).getByText('Records for September')).toBeTruthy();
  });

  it('D-54: an envelope row offers only "Which account?" and no answer', async () => {
    const { calls, rows } = await card([ITEMS.envelope as ReadinessItem], false);
    const row = screen.getByTestId('readiness-row-0');
    expect(within(row).queryAllByRole('button')).toHaveLength(0);
    await press(within(row).getByText('Which account?'));
    expect(calls.fix).toEqual([rows[0]]);
    expect(rows[0]?.fix).toEqual({ kind: 'linkEnvelope', envelopeId: 'g1' });
  });

  it('every fix and answer is at least 44 pt tall and announced as a link or button', async () => {
    await card([ITEMS.bill, ITEMS.envelope] as ReadinessItem[], true);
    const targets = [...screen.getAllByRole('button'), ...screen.getAllByRole('link')];
    expect(targets.length).toBeGreaterThanOrEqual(6);
    for (const t of targets) expect(StyleSheet.flatten(t.props.style).minHeight).toBeGreaterThanOrEqual(space.touchMin);
  });
});
