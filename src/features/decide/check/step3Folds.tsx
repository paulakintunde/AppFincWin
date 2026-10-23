/**
 * 05-74 (D-74, D-75, D-82, UI-SPEC R2 fold table): the one place that decides which step 3 folds exist, in which order, with
 * which title, preview, ⓘ and body. `useStep3Folds` builds the `FoldSpec` list; `Step3FoldList` renders it in the FoldList.
 * The bodies are elements only: a closed fold mounts nothing, so a hidden body computes nothing until it is opened. The
 * previews are small, plain reads of the settled computation (the D-56 memo is kept by the screen, which passes it in).
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ResolvedShare } from '@/engine/decide';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { canUse } from '../entitlements';
import { expectedIncomeCopy } from '../copy/depthInputsCopy';
import { edgeOn } from '../copy/depthVerdictCopy';
import {
  FOLD_INFO,
  FOLD_INFO_INVEST,
  FOLD_ORDER,
  FOLD_TITLE,
  FOLD_TITLE_INVEST,
  assumptionsPreview,
  cashPathPreview,
  ifInvestedPreview,
  incomePreview,
  investPreview,
  joinPreview,
  monthPreview,
  optionsPreview,
  setbacksPreview,
  whatBreaksPreview,
  whereItLandsPreview,
  whoPaysPreview,
  type Preview,
  type ProjectionFigures,
  type SectionKey,
} from '../copy/foldCopy';
import { percentText } from '../copy/percentText';
import { ref } from '../copy/types';
import { expectedReturnProjection } from '../snapshot/expectedReturn';
import type { CheckComputation } from '../snapshot/types';
import { FoldList, type FoldSpec } from '../ui/FoldList';
import type { FoldInfo } from '../ui/FoldRow';
import { useInfoSheet, type InfoSheetHandle } from '../ui/useInfoSheet';
import { AssumptionsBody, assumptionRows, type AssumptionsBodyExtras } from './sections/AssumptionsSection';
import { DayByDayBody } from './sections/DayByDaySection';
import { ExpectedIncomeBody } from './sections/ExpectedIncomeSection';
import { LedgersBody } from './sections/LedgersSection';
import { MonthBody } from './sections/MonthSection';
import { OptionsBody } from './sections/OptionsSection';
import { SetbacksBody } from './sections/SetbacksSection';
import { WhatBreaksBody } from './sections/WhatBreaksSection';
import { WhoPaysBody } from './sections/WhoPaysSection';
import { assessmentOf, moneyOf } from './sections/sectionUi';
import { InvestingInsteadBody } from './steps/step4/InvestingInsteadSection';
import { warnCardsOf } from './WarningList';
import type { StepProps } from './stepTypes';
import type { Translate } from './refText';

export type { SectionKey };

/** D-74: What breaks opens on arrival when anything breaks (card reasons included); otherwise every fold is closed. */
export function defaultOpenFold(computation: CheckComputation | null): SectionKey | null {
  if (computation === null) return null;
  const verdict = computation.status === 'logged' ? computation.verdict : null;
  const firstRead = computation.status === 'first_read' ? computation.firstRead : null;
  return warnCardsOf(verdict, firstRead, String, (d) => d).length > 0 ? 'whatBreaks' : null;
}

export interface Step3FoldArgs {
  /** The step props: inputs, update, computation, source, whole, exact, goToStep, readOnly, busy, stack. */
  step: StepProps;
  household: {
    memberCount: number;
    memberNames: readonly string[];
    share: ResolvedShare;
  };
  /** Ids of the setback results shown (the settled inputs on an open check, the stored ones on a bought one). */
  setbackResultIds: readonly string[];
  lineName: (lineId: string) => string;
  onOpenActivity: () => void;
  onSwitchToWait: () => void;
  assumptions: AssumptionsBodyExtras;
}

/** D-82 (R15.5): the investment check's fold 7 body. */
export function InvestGrowBody({ step }: { step: StepProps }): React.JSX.Element {
  const { inputs, computation, whole, source, goToStep } = step;
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const projection = expectedReturnProjection(inputs, computation.check);
  const metaStyle = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  if (projection === null) {
    return (
      <View style={styles.body}>
        <Text style={metaStyle}>{t('decide.fold.noReturn.body')}</Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('decide.fold.noReturn.link')}
          onPress={() => goToStep(2)}
          style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.fold.noReturn.link')}</Text>
        </Pressable>
      </View>
    );
  }
  if (projection.fv === null) {
    return (
      <View style={styles.body}>
        <Text style={metaStyle}>{t('decide.alt.reasonTooLarge')}</Text>
      </View>
    );
  }
  const fv = moneyOf(whole, source.currency)(projection.fv);
  return (
    <View style={styles.body}>
      <Text style={metaStyle}>{t('decide.pay.projection', { count: projection.months, fv, rate: projection.rateText })}</Text>
    </View>
  );
}

function infoOf(handle: InfoSheetHandle): FoldInfo {
  return {
    node: (
      <>
        {handle.button()}
        {handle.sheet}
      </>
    ),
    aboutLabel: handle.aboutAction.label,
    onAbout: handle.open,
  };
}

/** The folds that are present, in the R2 order. Info hooks run for every key on every render (rules of hooks). */
export function useStep3Folds(args: Step3FoldArgs): FoldSpec<SectionKey>[] {
  const { step, household, setbackResultIds, lineName, onOpenActivity, onSwitchToWait, assumptions } = args;
  const { inputs, update, computation, whole, exact, readOnly, busy, source } = step;
  const tRaw = useT();
  const t = tRaw as Translate;
  const currency = source.currency;

  const whatBreaksInfo = useInfoSheet(FOLD_INFO.whatBreaks ?? 'whatBreaks');
  const cashPathInfo = useInfoSheet(FOLD_INFO.cashPath ?? 'cashPath');
  const landsInfo = useInfoSheet(FOLD_INFO.whereItLands ?? 'whereItLands');
  const setbacksInfo = useInfoSheet(FOLD_INFO.setbacks ?? 'setbacks');
  const investedInfo = useInfoSheet(FOLD_INFO.ifInvested ?? 'ifInvested');
  const growInfo = useInfoSheet(FOLD_INFO_INVEST.ifInvested ?? 'expectedReturn');
  const incomeInfo = useInfoSheet(FOLD_INFO.income ?? 'incomeChange');

  const fmt = moneyOf(whole, currency);
  const formatDate = (d: string): string => whole.formatDate(d);
  const common = { computation, inputs, update, whole, exact, currency, readOnly, busy };
  const join = (p: Preview): string => joinPreview(t, p);
  const a = assessmentOf(computation);
  const verdict = computation.status === 'logged' ? computation.verdict : null;
  const firstRead = computation.status === 'first_read' ? computation.firstRead : null;
  const isInvest = inputs.kind === 'invest';
  const folds: FoldSpec<SectionKey>[] = [];
  const title = (key: SectionKey): string => t(isInvest ? (FOLD_TITLE_INVEST[key] ?? FOLD_TITLE[key]) : FOLD_TITLE[key]);

  // 1 What breaks: any logged or first-read verdict
  const hasVerdict = (verdict !== null && verdict.state !== 'missing') || (firstRead !== null && firstRead.state !== 'missing');
  if (hasVerdict) {
    const count = warnCardsOf(verdict, firstRead, fmt, formatDate).length;
    const edge = computation.decision !== null && edgeOn(computation.decision);
    folds.push({ key: 'whatBreaks', title: title('whatBreaks'), preview: join(whatBreaksPreview(count, edge)), info: infoOf(whatBreaksInfo), body: <WhatBreaksBody {...common} /> });
  }

  if (a !== null) {
    // 2 The month, line by line
    folds.push({ key: 'month', title: title('month'), preview: join(monthPreview(fmt(a.monthTable.now.left), fmt(a.monthTable.after.left))), body: <MonthBody {...common} /> });

    // 3 Cash path
    const lowest = a.cashPath.status === 'available' ? { amount: fmt(a.cashPath.lowestWith.amount), date: formatDate(a.cashPath.lowestWith.date) } : null;
    folds.push({
      key: 'cashPath',
      title: title('cashPath'),
      preview: join(cashPathPreview(lowest)),
      info: infoOf(cashPathInfo),
      body: <DayByDayBody {...common} stack={step.stack} formatDate={formatDate} />,
    });

    // 4 Where it lands
    folds.push({ key: 'whereItLands', title: title('whereItLands'), preview: join(whereItLandsPreview(a.ledgers)), info: infoOf(landsInfo), body: <LedgersBody {...common} /> });
  }

  // 5 If something goes wrong
  const setbackReport = computation.setbacks;
  if (canUse('setbacks') && setbackReport !== null) {
    const atRisk = computation.incomeAtRisk;
    const lost = atRisk?.runwayLost ?? null;
    const runwayWith = atRisk?.runwayWith ?? null;
    let preview: Preview;
    if (setbackReport.runwayMonths === null) preview = setbacksPreview(null, null);
    else if (lost !== null && lost > 0 && runwayWith !== null) preview = setbacksPreview(runwayWith, lost);
    else preview = ref('decide.section.setbacksSummary', { count: setbackReport.runwayMonths });
    folds.push({ key: 'setbacks', title: title('setbacks'), preview: join(preview), info: infoOf(setbacksInfo), body: <SetbacksBody {...common} resultIds={setbackResultIds} /> });
  }

  // 6 What would make it work: the state is not fits
  if (a !== null && verdict !== null && verdict.state !== 'fits' && computation.options.length > 0) {
    folds.push({
      key: 'options',
      title: title('options'),
      preview: join(optionsPreview(computation.options.length)),
      body: <OptionsBody {...common} lineName={lineName} onSwitchToWait={onSwitchToWait} onOpenActivity={onOpenActivity} />,
    });
  }

  // 7 If it went into investing instead / What it could grow to
  if (isInvest) {
    const projection = expectedReturnProjection(inputs, computation.check);
    let figures: ProjectionFigures | 'outOfRange' | null = null;
    if (projection !== null) figures = projection.fv === null ? 'outOfRange' : { fv: fmt(projection.fv), months: projection.months, rate: projection.rateText };
    folds.push({ key: 'ifInvested', title: title('ifInvested'), preview: join(investPreview(figures)), info: infoOf(growInfo), body: <InvestGrowBody step={step} /> });
  } else {
    const views = computation.investmentViews;
    if (views !== null) {
      const rateIndex = views.rates.findIndex((r) => r.rate > 0n);
      const figure = rateIndex < 0 ? undefined : views.priceInvested.byRate[rateIndex];
      const shown: ProjectionFigures | null =
        rateIndex < 0 || figure === undefined || figure.projected === null || figure.rangeCode !== null
          ? null
          : { fv: fmt(figure.projected), months: views.horizonMonths, rate: percentText(figure.rate) };
      folds.push({ key: 'ifInvested', title: title('ifInvested'), preview: join(ifInvestedPreview(shown)), info: infoOf(investedInfo), body: <InvestingInsteadBody {...step} /> });
    }
  }

  // 8 With the expected income
  const raise = computation.status === 'logged' ? (computation.decision?.withExpectedIncome ?? null) : null;
  if (raise !== null && expectedIncomeCopy(raise, fmt) !== null) {
    const state = raise.assessment.state === 'fits' ? 'fits' : raise.assessment.state === 'adjust' ? 'adjust' : 'no';
    folds.push({ key: 'income', title: title('income'), preview: join(incomePreview(state, fmt(raise.monthlyAmount))), info: infoOf(incomeInfo), body: <ExpectedIncomeBody {...common} /> });
  }

  // 9 Who pays what: a household of two or more
  if (inputs.scope === 'household' && household.memberCount > 1) {
    folds.push({
      key: 'whoPays',
      title: title('whoPays'),
      preview: join(whoPaysPreview(household.memberCount)),
      body: (
        <WhoPaysBody
          {...common}
          memberCount={household.memberCount}
          memberNames={household.memberNames}
          share={household.share}
          dayOneTotal={a === null ? 0 : a.plan.dayOne}
          monthlyTotal={a === null ? 0 : a.plan.monthly}
        />
      ),
    });
  }

  // 10 Assumptions in play: always
  const assumptionProps = { ...common, ...assumptions };
  folds.push({
    key: 'assumptions',
    title: title('assumptions'),
    preview: join(assumptionsPreview(assumptionRows(assumptionProps, tRaw).length)),
    body: <AssumptionsBody {...assumptionProps} />,
  });

  // keep the order the spec fixes even if a block above is ever moved
  return folds.sort((x, y) => FOLD_ORDER.indexOf(x.key) - FOLD_ORDER.indexOf(y.key));
}

export interface Step3FoldListProps extends Step3FoldArgs {
  openKey: SectionKey | null;
  onOpenChange: (key: SectionKey | null) => void;
}

/** The FoldList of step 3. A component so the info hooks of `useStep3Folds` run inside the step 3 render only. */
export function Step3FoldList({ openKey, onOpenChange, ...args }: Step3FoldListProps): React.JSX.Element {
  const folds = useStep3Folds(args);
  return <FoldList folds={folds} openKey={openKey} onOpenChange={onOpenChange} />;
}

const styles = StyleSheet.create({
  body: { gap: space.gapSm },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
