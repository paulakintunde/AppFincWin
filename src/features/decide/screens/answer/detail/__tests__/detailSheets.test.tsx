// 06.1-20: the More detail sheets and the compare screen, on engine-run fixtures (D-15). Figures are read back from the engine's own
// outputs; nothing here is a prototype number.
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { cashTimeline, judgeBoth, judgeCheck, prepare, verdictRowFor, type CashTimeline, type LocalDate, type MonthBar } from '@/engine/decide/v3';
import en from '@/i18n/locales/en';
import { wrap } from '@/test/stepProps';
import { toEngineInputs } from '@/engine/decide/v3/__tests__/rightAnswers/fixture';
import { loadCases } from '@/engine/decide/v3/__tests__/rightAnswers/loader';
import { ledgerRun } from '../../__tests__/fixtures';
import { barGeometry } from '../detailKit';
import { BuyLaterSheet, laterDates } from '../BuyLaterSheet';
import { CheaperSheet, parseYearsOfUse } from '../CheaperSheet';
import { CompareScreen } from '../CompareScreen';
import { CostsThatStopSheet } from '../CostsThatStopSheet';
import { EveryDateSheet, timelineItems } from '../EveryDateSheet';
import { FullCostSheet, fullCostFigures } from '../FullCostSheet';
import { MonthAfterSheet } from '../MonthAfterSheet';
import { aheadMonths, MonthByMonthSheet } from '../MonthByMonthSheet';

jest.setTimeout(30000);

jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/ui/Sheet', () => {
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <View>{children}</View> : null),
    SheetScroll: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

const FOOTER = en.legal.decideAnswer.footer;
const CAVEAT = en.legal.decideAnswer.caveat;
const noop = (): void => undefined;
const detail = en.decide.screens.answerDetail;
const SHORT = /short/;

/** An installments check from the engine's right-answers cases: fits by borrowing, the plan costs more (BR-02). */
function planRun() {
  const found = loadCases().find((c) => c.id === 'BR-02');
  if (found === undefined) throw new RangeError('no right-answers case BR-02');
  const { inputs, check } = toEngineInputs(found.fixture);
  return { inputs, check, evaluation: judgeCheck(prepare(inputs), check) };
}

describe('FullCostSheet (D54)', () => {
  it('lists price, an estimate tax row, fees, plan interest and fees, and carries the footer', async () => {
    const r = planRun();
    const figures = fullCostFigures(r.evaluation, r.check);
    expect(figures.planCost).not.toBeNull();
    await wrap(<FullCostSheet itemName="Car" currency={r.inputs.currency} figures={figures} onClose={noop} />);
    expect(screen.getByText(detail.fullCost.price)).toBeTruthy();
    expect(screen.getByText(detail.fullCost.taxEstimate)).toBeTruthy();
    expect(screen.getByText(detail.fullCost.planCost)).toBeTruthy();
    expect(screen.getByText(FOOTER)).toBeTruthy();
    expect(figures.total).toBe(r.evaluation.planCard?.total);
  });

  it('a one-off has no plan row and the foreign line shows when asked', async () => {
    const r = ledgerRun('N02');
    const figures = fullCostFigures(r.evaluation, r.check);
    expect(figures.planCost).toBeNull();
    await wrap(<FullCostSheet itemName="Headphones" currency={r.inputs.currency} figures={figures} foreign onClose={noop} />);
    expect(screen.queryByText(detail.fullCost.planCost)).toBeNull();
    expect(screen.getByTestId('fullcost-foreign')).toBeTruthy();
  });
});

describe('EveryDateSheet (D55)', () => {
  it('marks exactly one lowest row and it equals the timeline lowest', async () => {
    const r = ledgerRun('N02');
    const timeline = cashTimeline(prepare(r.inputs), r.check);
    const marked = timelineItems(timeline).filter((i) => i.lowest);
    expect(marked).toHaveLength(1);
    expect(marked[0]?.balance).toBe(timeline.lowest.balance);
    expect(marked[0]?.date).toBe(timeline.lowest.date);
    await wrap(<EveryDateSheet timeline={timeline} currency={r.inputs.currency} accountName="Everyday" onClose={noop} />);
    expect(screen.getAllByTestId('everydate-lowest')).toHaveLength(1);
    expect(screen.getByText(detail.everyDate.spendingNote)).toBeTruthy();
    expect(screen.getByText(FOOTER)).toBeTruthy();
  });

  it('a balance below zero reads short and a lowest day with no line gets its own row', async () => {
    const timeline: CashTimeline = {
      start: 10_000 as never,
      rows: [{ date: '2026-11-05', amount: -30_000 as never, kind: 'bill', seriesId: null, debtId: null, balanceAfter: -20_000 as never }],
      lowest: { date: '2026-11-09', balance: -25_000 as never },
    };
    const items = timelineItems(timeline);
    expect(items.map((i) => i.key)).toEqual(['r0', 'lowest']);
    await wrap(<EveryDateSheet timeline={timeline} currency="USD" accountName="Everyday" onClose={noop} />);
    expect(screen.getAllByText(SHORT).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByTestId('everydate-lowest')).toHaveLength(1);
  });
});

describe('Month by month and Your month after buying', () => {
  const bars: MonthBar[] = [
    { month: '2026-08' as never, comesIn: 300_000 as never, goesOut: 250_000 as never, left: 50_000 as never },
    { month: '2026-09' as never, comesIn: 300_000 as never, goesOut: 340_000 as never, left: -40_000 as never },
  ];

  it('barGeometry grows a negative bar downward from the zero line', () => {
    const g = barGeometry([50_000, -40_000], 90);
    expect(g.bars[0]?.down).toBe(false);
    expect(g.bars[1]?.down).toBe(true);
    expect(g.bars[1]?.y).toBe(g.zeroY);
    expect((g.bars[0]?.y ?? 0) + (g.bars[0]?.h ?? 0)).toBeCloseTo(g.zeroY);
  });

  it('a month below zero carries the word short', async () => {
    await wrap(<MonthByMonthSheet bars={bars} ahead={[]} currency="USD" onClose={noop} />);
    expect(screen.getByTestId('monthbymonth-row-p2026-09')).toHaveTextContent(SHORT);
    expect(screen.getByTestId('monthbymonth-row-p2026-08')).not.toHaveTextContent(SHORT);
    expect(screen.getByText(FOOTER)).toBeTruthy();
  });

  it('the months ahead come from the engine afterBuy, and the saving variant from buyLater', async () => {
    const r = ledgerRun('N09');
    const ahead = aheadMonths(r.evaluation.result.afterBuy, null, false);
    expect(ahead[0]?.left).toBe(r.evaluation.result.afterBuy.month);
    expect(aheadMonths(null, null, true)).toEqual([]);
    await wrap(<MonthByMonthSheet bars={[]} ahead={ahead} currency={r.inputs.currency} onClose={noop} />);
    expect(screen.getByTestId('monthbymonth-row-now')).toBeTruthy();
  });

  it('Your month after buying shows the figure the engine leads with, and short when it is below zero', async () => {
    const r = ledgerRun('N26');
    await wrap(<MonthAfterSheet afterBuy={r.evaluation.result.afterBuy} currency={r.inputs.currency} onClose={noop} />);
    expect(screen.getByText(detail.monthAfter.title)).toBeTruthy();
    const left = r.evaluation.result.afterBuy.month;
    if (left < 0) expect(screen.getByTestId('monthafter-row-now')).toHaveTextContent(SHORT);
    else expect(screen.getByTestId('monthafter-row-now')).not.toHaveTextContent(SHORT);
    expect(screen.getByText(FOOTER)).toBeTruthy();
  });
});

describe('CostsThatStopSheet (D59 / N17)', () => {
  it('says none counted and offers to add one', async () => {
    const onAdd = jest.fn();
    await wrap(<CostsThatStopSheet replaces={null} runningMonthly={0} facts={[]} currency="USD" names={{ stop: () => '' }} onAdd={onAdd} onClose={noop} />);
    expect(screen.getByText(detail.stops.none)).toBeTruthy();
    await fireEvent.press(screen.getByText(detail.stops.add));
    expect(onAdd).toHaveBeenCalled();
  });

  it('shows a stopped cost at its monthly share, the sale and the net change', async () => {
    const replaces = {
      stops: [{ id: 's1', amount: 12_000 as never, everyMonths: 12 as const, stopDate: '2026-12-01' as never, source: { kind: 'bill' as const, seriesId: 'b1' } }],
      sale: { amount: 50_000 as never, arrives: '2026-12-10' as never, paysDebtId: null },
    };
    await wrap(
      <CostsThatStopSheet
        replaces={replaces}
        runningMonthly={500}
        facts={[{ code: 'sale_counted', values: { amount: 50_000, date: '2026-12-10' } } as never]}
        currency="USD"
        names={{ stop: () => 'Old plan' }}
        onAdd={noop}
        onClose={noop}
      />
    );
    expect(screen.getByText('Old plan')).toBeTruthy();
    expect(screen.getByText(detail.stops.saleLabel)).toBeTruthy();
    expect(screen.getByTestId('stops-sale-counted')).toBeTruthy();
    expect(screen.getByLabelText(new RegExp(detail.stops.change))).toBeTruthy();
  });
});

describe('BuyLaterSheet (D60)', () => {
  it('judges each date again and shows a verdict word for each', async () => {
    const r = ledgerRun('N02');
    const prepared = prepare(r.inputs);
    const judgeOn = jest.fn((d: LocalDate) => judgeCheck(prepared, { ...r.check, purchaseDate: d }));
    const onUse = jest.fn();
    const dates = ['2026-11-20', '2026-12-05'] as LocalDate[];
    expect(laterDates('2026-11-05', null, dates[0] as LocalDate, [dates[1] as LocalDate, '2026-10-01' as LocalDate])).toEqual(dates);
    await wrap(
      <BuyLaterSheet
        currency={r.inputs.currency}
        today="2026-11-05"
        futures={null}
        readyOn={dates[0] as LocalDate}
        paydays={[dates[1] as LocalDate]}
        judgeOn={judgeOn}
        onUseDate={onUse}
        onClose={noop}
      />
    );
    for (const d of dates) {
      expect(screen.getByTestId(`later-word-${d}`)).toBeTruthy();
      expect(judgeOn).toHaveBeenCalledWith(d);
    }
    expect(screen.getByText(FOOTER)).toBeTruthy();
    expect(screen.getByText(CAVEAT)).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`later-option-${dates[1]}`));
    await fireEvent.press(screen.getByText(detail.later.use));
    expect(onUse).toHaveBeenCalledWith(dates[1]);
  });
});

describe('CheaperSheet (D61)', () => {
  it('asks the years of use, shows the cost a year and re-checks at the typed price', async () => {
    const onCheck = jest.fn();
    await wrap(<CheaperSheet currency="USD" price={35_000} cheaperPrice={null} useYears={null} onCheck={onCheck} onClose={noop} />);
    await fireEvent.changeText(screen.getByLabelText(detail.cheaper.price), '200');
    await fireEvent.changeText(screen.getByLabelText(detail.cheaper.years), '2');
    expect(screen.getByTestId('cheaper-figures')).toBeTruthy();
    await fireEvent.press(screen.getByText(detail.cheaper.check));
    expect(onCheck).toHaveBeenCalledWith({ cheaperPrice: 20_000, useYears: 2 });
    expect(screen.getByText(CAVEAT)).toBeTruthy();
  });

  it('will not re-check at a price at or above the picked one', async () => {
    const onCheck = jest.fn();
    await wrap(<CheaperSheet currency="USD" price={35_000} cheaperPrice={null} useYears={null} onCheck={onCheck} onClose={noop} />);
    await fireEvent.changeText(screen.getByLabelText(detail.cheaper.price), '400');
    await fireEvent.press(screen.getByText(detail.cheaper.check));
    expect(onCheck).not.toHaveBeenCalled();
  });

  it('reads years of use', () => {
    expect([parseYearsOfUse(''), parseYearsOfUse('0'), parseYearsOfUse('2,5'), parseYearsOfUse('101')]).toEqual([null, null, 2.5, null]);
  });
});

describe('CompareScreen (N16 / D62)', () => {
  const run = planRun();
  const both = judgeBoth(prepare(run.inputs), run.check);
  const wordOf = (e: typeof both.cash): string => {
    const row = verdictRowFor(e.result.code, e.result.variant, e.purchase === null || e.purchase.schedule === null);
    return row.chipKey.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], en) as string;
  };

  it('uses judgeBoth for each side and gives each its own verdict', async () => {
    expect(both.plan).not.toBeNull();
    const spy = jest.fn(() => both);
    await wrap(<CompareScreen check={run.check} currency={run.inputs.currency} engine={{ both: spy }} onSeeAnswer={noop} onCantSee={noop} />);
    expect(spy).toHaveBeenCalled();
    expect(screen.getByTestId('compare-cash-word')).toHaveTextContent(wordOf(both.cash));
    expect(screen.getByTestId('compare-plan-word')).toHaveTextContent(wordOf(both.plan!));
    expect(screen.getByTestId('compare-row-interest')).toBeTruthy();
    expect(screen.getByText(FOOTER)).toBeTruthy();
    expect(screen.getByText(CAVEAT)).toBeTruthy();
  });

  it('gives both sides identical styles and equal buttons', async () => {
    await wrap(<CompareScreen check={run.check} currency={run.inputs.currency} engine={{ both: () => both }} onSeeAnswer={noop} onCantSee={noop} />);
    for (const key of ['upFront', 'eachMonth', 'inAll', 'interest', 'usual', 'answer']) {
      const cash = screen.getByTestId(`compare-cash-${key}`);
      const plan = screen.getByTestId(`compare-plan-${key}`);
      expect(StyleSheet.flatten(cash.props.style)).toEqual(StyleSheet.flatten(plan.props.style));
    }
    const a = screen.getByText(detail.sideBySide.seeCash);
    const b = screen.getByText(detail.sideBySide.seeInstallments);
    expect(StyleSheet.flatten(a.props.style)).toEqual(StyleSheet.flatten(b.props.style));
  });

  it('shows the cash side alone for a check paid once, and routes each button', async () => {
    const once = ledgerRun('N02');
    const onceBoth = judgeBoth(prepare(once.inputs), once.check);
    const onSee = jest.fn();
    await wrap(<CompareScreen check={once.check} currency={once.inputs.currency} engine={{ both: () => onceBoth }} onSeeAnswer={onSee} onCantSee={noop} />);
    expect(onceBoth.plan).toBeNull();
    expect(screen.queryByTestId('compare-plan-word')).toBeNull();
    expect(screen.getByText(detail.sideBySide.noPlan)).toBeTruthy();
    await fireEvent.press(screen.getByText(detail.sideBySide.seeCash));
    expect(onSee).toHaveBeenCalledWith('cash');
  });

  it('stacks the sides above 1.3x text scale', async () => {
    await wrap(<CompareScreen check={run.check} currency={run.inputs.currency} engine={{ both: () => both }} onSeeAnswer={noop} onCantSee={noop} />, 1.5);
    expect(screen.queryByTestId('compare-head')).toBeNull();
    expect(screen.getAllByText(detail.sideBySide.installments).length).toBeGreaterThan(1);
  });
});
