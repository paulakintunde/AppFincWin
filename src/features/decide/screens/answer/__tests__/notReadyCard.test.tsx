// 06.1-44 (G-1, C-1, C-2, A-ANS-3, D-54): the Not ready card names each item with its fix and answers, and offers quick estimates
// only when they can count. 06.1-66 (OQ-66-1, OQ-66-2, FQ6): no count, the first item only ("First: …") and "More may follow";
// a "More needed" ask names its first missing figure; the two exits.
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { ReadinessItem } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { wrap } from '@/test/stepProps';
import { space } from '@/theme/layout';
import { readinessFixRows, type ReadinessFixRow, type WaiverChoice } from '../../logic/readinessFixes';
import { NotReadyCard, NotReadyExits } from '../StatusCards';

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

const FIX_LABEL = 'Fix';
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

async function card(items: readonly ReadinessItem[], canUseEstimates: boolean, missing: { text: string; after: React.ReactNode } | null = null) {
  const calls = { fix: [] as ReadinessFixRow[], choice: [] as [ReadinessFixRow, WaiverChoice][], finish: 0, estimates: 0 };
  const rows = readinessFixRows(items, ASOF);
  await wrap(
    <NotReadyCard
      rows={rows}
      missing={missing}
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
    ['envelope', 'Holiday (a Grow goal) has no account yet.'],
  ])('%s reads as one sentence, one accessibility stop', async (key, text) => {
    await card([ITEMS[key] as ReadinessItem], false);
    const node = screen.getByText(`First: ${text}`);
    expect(node.props.accessible).toBe(true);
    expect(within(screen.getByTestId('readiness-row-0')).getByText(`First: ${text}`)).toBeTruthy();
  });

  it('an envelope with no name still says what is missing', async () => {
    await card([{ ...(ITEMS.envelope as ReadinessItem), name: null }], false);
    expect(screen.getByText('First: A Grow goal has no account yet.')).toBeTruthy();
  });

  it('DS-1: a goal row says it is a Grow goal, with why it matters behind Why?', async () => {
    await card([ITEMS.envelope as ReadinessItem], false);
    expect(screen.getByText('First: Holiday (a Grow goal) has no account yet.')).toBeTruthy();
    expect(screen.queryByTestId('readiness-why-0-body')).toBeNull();
    const why = screen.getByTestId('readiness-why-0');
    expect(why.props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));
    await press(why);
    expect(screen.getByTestId('readiness-why-0-body')).toHaveTextContent('Decide sets goal money aside before it answers, so it needs the account that holds it.');
    expect(screen.getByTestId('readiness-why-0').props.accessibilityState).toEqual(expect.objectContaining({ expanded: true }));
    await press(screen.getByText('Less'));
    expect(screen.queryByTestId('readiness-why-0-body')).toBeNull();
  });

  it('DS-1: rows that are not goals carry no Why?', async () => {
    await card([ITEMS.bill as ReadinessItem], false);
    expect(screen.queryByTestId('readiness-why-0')).toBeNull();
  });
});

describe('06.1-68 (CB-11, CF-2): an answered row shows at once', () => {
  async function answeredCard(items: readonly ReadinessItem[], answeredIdx: readonly number[]) {
    const rows = readinessFixRows(items, ASOF);
    const answered = new Set(answeredIdx.map((i) => (rows[i] as ReadinessFixRow).id));
    const calls: [ReadinessFixRow, WaiverChoice][] = [];
    await wrap(
      <NotReadyCard
        rows={rows}
        canUseEstimates={false}
        asOf={ASOF}
        {...fmt}
        answered={answered}
        onFix={() => undefined}
        onChoice={(r, c) => calls.push([r, c])}
        onFinishSetup={() => undefined}
        onFromEstimates={() => undefined}
      />
    );
    await screen.findByTestId('answer-not-ready');
    return calls;
  }

  it('the answered row reads "Saved, updating…", its choices are off, and the next open row is named First', async () => {
    const calls = await answeredCard([ITEMS.bill, ITEMS.pay] as ReadinessItem[], [0]);
    expect(screen.getByTestId('readiness-saved-0')).toHaveTextContent('Saved, updating…');
    expect(screen.queryByTestId('readiness-fix-0')).toBeNull();
    const row0 = within(screen.getByTestId('readiness-row-0'));
    for (const label of ['It didn’t happen', 'Someone else paid it']) {
      const pill = row0.getByRole('button', { name: label });
      expect(pill.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
      await press(pill);
    }
    expect(calls).toHaveLength(0);
    // the row sentence drops "First:", which moves to the next open item
    expect(row0.getByText('Netflix, $11.99 due D10-03, isn’t in your records yet.')).toBeTruthy();
    expect(within(screen.getByTestId('readiness-row-1')).getByText(/^First: Salary/)).toBeTruthy();
  });

  it('with no answered rows the card is as before: the first row only', async () => {
    await answeredCard([ITEMS.bill, ITEMS.pay] as ReadinessItem[], []);
    expect(screen.queryByTestId('readiness-saved-0')).toBeNull();
    expect(screen.queryByTestId('readiness-row-1')).toBeNull();
    expect(screen.getByText(/^First: Netflix/)).toBeTruthy();
  });

  it('when every row is answered, each reads "Saved, updating…" and none is named First', async () => {
    await answeredCard([ITEMS.bill] as ReadinessItem[], [0]);
    expect(screen.getByTestId('readiness-saved-0')).toBeTruthy();
    expect(screen.queryByText(/^First:/)).toBeNull();
  });
});

describe('the lead line (06.1-66 OQ-66-1, DN-10: no count)', () => {
  it('one item: "Not ready yet", the item as "First: …", and "More may follow"', async () => {
    await card([ITEMS.bill as ReadinessItem], false);
    expect(screen.getByText('Not ready yet')).toBeTruthy();
    expect(screen.queryByText(/thing/)).toBeNull();
    expect(screen.getByText('First: Netflix, $11.99 due D10-03, isn’t in your records yet.')).toBeTruthy();
    // 06.1-67 (G-10): the caveat opens under the card's More row.
    expect(screen.queryByText('More may follow once this is done.')).toBeNull();
    await press(screen.getByTestId('answer-not-ready-more'));
    expect(screen.getByText('More may follow once this is done.')).toBeTruthy();
  });

  it('several items: still no number, and only the first one shows', async () => {
    await card([ITEMS.pay, ITEMS.bill, ITEMS.spending] as ReadinessItem[], false);
    expect(screen.getByText('Not ready yet')).toBeTruthy();
    expect(screen.queryByText(/\d+ things?/)).toBeNull();
    expect(screen.getByTestId('readiness-row-0')).toBeTruthy();
    expect(screen.queryByTestId('readiness-row-1')).toBeNull();
    expect(screen.getByText(/^First: Salary/)).toBeTruthy();
    expect(screen.getByTestId('answer-not-ready-more')).toBeTruthy();
  });

  it('DS-4: the card never says "If you buy it today."', async () => {
    await card([ITEMS.pay, ITEMS.bill] as ReadinessItem[], false);
    expect(screen.queryByText(/If you buy it today/)).toBeNull();
    expect(screen.queryByText(/Bought on/)).toBeNull();
  });

  it('a brand-new person (no items, estimates can count) never reads "0 things" and gets estimates as the primary (A-ANS-3)', async () => {
    const { calls } = await card([], true);
    expect(screen.queryByText(/0 things/)).toBeNull();
    expect(screen.getByText('Not ready yet')).toBeTruthy();
    expect(screen.queryByTestId('answer-not-ready-more')).toBeNull();
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

  it('spending names its month', async () => {
    await card([ITEMS.spending] as ReadinessItem[], false);
    expect(within(screen.getByTestId('readiness-row-0')).getByText('Nothing more for October')).toBeTruthy();
  });

  it('a late start names its months', async () => {
    await card([ITEMS.lateStart] as ReadinessItem[], false);
    expect(within(screen.getByTestId('readiness-row-0')).getByText('Records begin in October')).toBeTruthy();
    expect(within(screen.getByTestId('readiness-row-0')).getByText('Records for September')).toBeTruthy();
  });

  it('D-54: an envelope row offers only "Which account?" and no answer', async () => {
    const { calls, rows } = await card([ITEMS.envelope as ReadinessItem], false);
    const row = screen.getByTestId('readiness-row-0');
    // no answer buttons: the only button is DS-1's Why? disclosure (06.1-68)
    expect(within(row).queryAllByRole('button').map((n) => n.props.testID)).toEqual(['readiness-why-0']);
    await press(within(row).getByText('Which account?'));
    expect(calls.fix).toEqual([rows[0]]);
    expect(rows[0]?.fix).toEqual({ kind: 'linkEnvelope', envelopeId: 'g1' });
  });

  it('every fix and answer is at least 44 pt tall and announced as a link or button', async () => {
    await card([ITEMS.bill] as ReadinessItem[], true);
    const targets = [...screen.getAllByRole('button'), ...screen.getAllByRole('link')];
    expect(targets.length).toBeGreaterThanOrEqual(6);
    for (const t of targets) expect(StyleSheet.flatten(t.props.style).minHeight).toBeGreaterThanOrEqual(space.touchMin);
  });
});

describe('06.1-66 (OQ-66-2, DS-2): one layout for Not ready yet and More needed', () => {
  it('a More needed ask with no readiness row names its first missing figure, with what sits under it', async () => {
    await card([], false, { text: 'To compare, add your income figures.', after: <Text testID="fix-link">{FIX_LABEL}</Text> });
    expect(screen.getByText('Not ready yet')).toBeTruthy();
    expect(within(screen.getByTestId('answer-not-ready-missing')).getByText('First: To compare, add your income figures.')).toBeTruthy();
    expect(screen.getByTestId('fix-link')).toBeTruthy();
    // 06.1-67 (G-10): the caveat opens under the card's More row.
    expect(screen.queryByText('More may follow once this is done.')).toBeNull();
    await press(screen.getByTestId('answer-not-ready-more'));
    expect(screen.getByText('More may follow once this is done.')).toBeTruthy();
    expect(screen.queryByText(/If you buy it today/)).toBeNull();
  });

  it('a readiness row comes before a missing figure', async () => {
    await card([ITEMS.bill as ReadinessItem], false, { text: 'A missing figure.', after: null });
    expect(screen.getByTestId('readiness-row-0')).toBeTruthy();
    expect(screen.queryByTestId('answer-not-ready-missing')).toBeNull();
  });
});

describe('06.1-66 (FQ6): the two exits', () => {
  it('I’m not buying it and Delete this check, each a 44 pt button', async () => {
    const calls = { notBuying: 0, del: 0 };
    await wrap(<NotReadyExits onNotBuying={() => (calls.notBuying += 1)} onDelete={() => (calls.del += 1)} />);
    await screen.findByTestId('answer-not-ready-exits');
    await press(screen.getByText('I’m not buying it'));
    await press(screen.getByText('Delete this check'));
    expect(calls).toEqual({ notBuying: 1, del: 1 });
    for (const b of screen.getAllByRole('button')) expect(StyleSheet.flatten(b.props.style).minHeight).toBeGreaterThanOrEqual(space.touchMin);
  });
});
