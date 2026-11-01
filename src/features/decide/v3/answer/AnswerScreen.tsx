/**
 * 05.3-41 (DSV-07, DSV-08, DSV-13, DSV-15, D-06, D-07, D-08, D-13, D-52): the Answer screen, assembled from the built parts.
 * Order: header, change tile and notices, the hero (or the not-ready card, or the in-place question), the refund tile, the
 * funding strip, facts, the assumptions line, the needs-input card, links, then the fixed action bar.
 * - Not ready (D-52): the not-ready card stands in place of the hero. No verdict, strip, facts or action bar.
 * - A question (D-07/D-08): the question card stands in place of the hero; the strip, facts and bar give way to "Your answer is
 *   saved as you go." After the last answer the hero rises in and focus moves to it.
 * - Decided checks (D-13): the stored answer (answer_v3) is shown with "Changed since you saved" when the live code differs;
 *   the only actions are Check again and Check another price, both of which start a NEW check. Nothing here re-decides a check.
 * Every record write goes through RecordSheet and V3RecordProvider; this screen never saves an answer itself.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCheckV3 } from '@/data/queries/decideCheckV3';
import { useReopenCheck } from '@/data/mutations/decideChecks';
import type { DecideCheckRow } from '@/db/decideChecks';
import { readStoredCheck } from '@/engine/decide/v3';
import type { Evaluation, V3Inputs } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { useRecordContext } from '@/features/record/useRecordContext';
import { getAnalytics } from '@/services/analytics';
import type { DecideBand } from '@/services/analytics/catalogue';
import { useScreenTitleFocus } from '@/shell/a11yFocus';
import { replaceOnce } from '@/shell/navigation/pushOnce';
import { space } from '@/theme/layout';
import { DURATION, EASING, useReduceMotion } from '@/theme/motion';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { AskCard } from '../ask/AskCard';
import { focusNode } from '../ask/focusNode';
import { AnswerActionBar } from '../answerLower/AnswerActionBar';
import { AnswerLinks } from '../answerLower/AnswerLinks';
import { FactRows } from '../answerLower/FactRows';
import { NeedsInputCard } from '../answerLower/NeedsInputCard';
import { RefundHintTile } from '../answerLower/RefundHintTile';
import { ChangedSinceOpenedTile, ChangedSinceSavedTile, SavedAnswerLine } from '../answerParts/ChangeTiles';
import { FundingStrip } from '../answerParts/FundingStrip';
import { assumptions } from '../model/assumptions';
import { askModel, needsInputLines } from '../model/ask';
import { changedSinceOpened, changedSinceSaved } from '../model/answerChange';
import { factRows } from '../model/factRows';
import { fundingStrip } from '../model/funding';
import { answerShownProps } from '../model/hero';
import { helpOffered } from '../model/helpOffered';
import { percentToText } from '../model/percentText';
import { planModel } from '../model/planModel';
import { refundHint } from '../model/refundHint';
import { waiverNote, waiverRows, type WaiverText } from '../model/waiverNote';
import { DECIDE_TAB_HREF, answerHref, purchaseHref } from '../nav/hrefs';
import { useBackToDecide } from '../nav/useBackToDecide';
import { useReopenOutcome } from '../nav/useReopenOutcome';
import { V3CopyNotSaved } from '../nav/V3CopyNotSaved';
import { V3NotFound } from '../nav/V3NotFound';
import { V3Skeleton } from '../nav/V3Skeleton';
import { NotReadyCard } from '../ready/NotReadyCard';
import { useReadinessAnswer } from '../ready/useReadinessAnswer';
import { RecordSheet, type RecordVariant } from '../record/RecordSheet';
import { useV3Format } from '../shared/useV3Format';
import { AnswerHeader } from './AnswerHeader';
import { AnswerHero } from './AnswerHero';
import { ConfidenceChipV3 } from './ConfidenceChipV3';
import { ConfidenceSheetV3, waiverText } from './ConfidenceSheetV3';
import { NoticeTiles } from './NoticeTiles';
import { renderQuestionBody } from './questionBodies';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const RISE_FROM = 8;

/** fw-rise: the hero fades and lifts in when the last question was just answered. Reduced motion shows it at once. */
function Rise({ active, children }: { active: boolean; children: React.ReactNode }): React.JSX.Element {
  const reduced = useReduceMotion();
  const v = useSharedValue(active && !reduced ? 0 : 1);
  useEffect(() => {
    v.value = withTiming(1, { duration: reduced ? 0 : DURATION.entrance, easing: EASING });
  }, [reduced, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * RISE_FROM }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** The whole-plan total for a periodic check, in minor units; null for a one-off. */
function wholePlanTotalOf(row: DecideCheckRow, evaluation: Evaluation): number | null {
  if (evaluation.purchase === null || evaluation.purchase.schedule === null) return null;
  const check = readStoredCheck(row.inputs).check;
  const model = planModel({
    purchase: evaluation.purchase,
    planCard: evaluation.planCard,
    quoted: evaluation.quoted,
    taxPercent: check.taxPercent,
    rate: check.pay.mode === 'plan' ? check.pay.apr : null,
    deposit: check.pay.mode === 'plan' ? check.pay.deposit : undefined,
  });
  return model === null ? null : Number(model.total.amount);
}

type Loaded = Omit<BodyProps, 'id' | 'busy'>;

export function AnswerScreen({ id }: { id: string }): React.JSX.Element {
  const { status, row, evaluation, withoutRefunds, inputs } = useCheckV3(id);
  // 05.3-100: a reopen copy the server answered with an existing live copy moves there; one that did not save says so.
  const { redirectTo, failed } = useReopenOutcome(id);
  useEffect(() => {
    if (redirectTo !== null) replaceOnce(answerHref(redirectTo));
  }, [redirectTo]);
  // A recompute never blanks the screen: while the reads reload, the last answer stays and the hero is marked busy.
  const [kept, setKept] = useState<Loaded | null>(null);
  const fresh = status !== 'loading' && row !== null && evaluation !== null && inputs !== null;
  if (fresh && (kept === null || kept.row !== row || kept.evaluation !== evaluation || kept.inputs !== inputs || kept.withoutRefunds !== withoutRefunds)) {
    setKept({ row, evaluation, withoutRefunds, inputs });
  }
  if (fresh) return <AnswerBody id={id} row={row} evaluation={evaluation} withoutRefunds={withoutRefunds} inputs={inputs} busy={false} />;
  if (status === 'loading') {
    return kept === null ? <V3Skeleton /> : <AnswerBody id={id} {...kept} busy />;
  }
  if (redirectTo !== null) return <V3Skeleton />;
  return failed ? <V3CopyNotSaved /> : <V3NotFound />;
}

interface BodyProps {
  id: string;
  row: DecideCheckRow;
  evaluation: Evaluation;
  withoutRefunds: Evaluation | null;
  inputs: V3Inputs;
  busy: boolean;
}

function AnswerBody({ id, row, evaluation, withoutRefunds, inputs, busy }: BodyProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const insets = useSafeAreaInsets();
  const { reopen } = useReopenCheck();
  const { clearWaiver } = useReadinessAnswer();

  const titleRef = useRef<React.ComponentRef<typeof Text>>(null);
  useScreenTitleFocus(titleRef as never);
  const heroRef = useRef<View>(null);

  const result = evaluation.result;
  const decided = row.status !== 'open';
  const ready = result.readiness?.ready !== false;
  const ask = !decided && ready ? askModel(evaluation) : null;
  const asking = ask !== null;
  const showHero = ready && !asking;

  // D-52: the answer a verdict-bearing screen opened with; the baseline waits until a verdict is actually on screen.
  const [opened, setOpened] = useState<{ code: Evaluation['result']['code']; variant: Evaluation['result']['variant'] } | null>(null);
  if (opened === null && showHero) setOpened({ code: result.code, variant: result.variant });
  const openedTile = useMemo(
    () => (opened === null || decided ? null : changedSinceOpened(opened.code, opened.variant, result.code, result.variant)),
    [opened, decided, result.code, result.variant],
  );
  const savedTile = useMemo(() => (decided ? changedSinceSaved(row.answer_v3, result) : null), [decided, row.answer_v3, result]);

  // decide_answer_shown: when a verdict first shows, and again only when its code changes.
  const shownCode = showHero ? result.code : null;
  const trackedCode = useRef<string | null>(null);
  useEffect(() => {
    if (shownCode === null || trackedCode.current === shownCode) return;
    trackedCode.current = shownCode;
    const shown = answerShownProps(evaluation);
    // the event catalogue writes the band as a string literal
    getAnalytics().track('decide_answer_shown', { ...shown, band: String(shown.band) as DecideBand });
  }, [shownCode, evaluation]);

  // After the last question: the hero rises in and focus moves to it.
  const [rise, setRise] = useState(false);
  useEffect(() => {
    if (!rise || !showHero) return;
    focusNode(heroRef.current);
  }, [rise, showHero]);

  const [confOpen, setConfOpen] = useState(false);
  const [sheet, setSheet] = useState<{ variant: RecordVariant; open: boolean; status: DecideCheckRow['status'] } | null>(null);
  // 05.3-110: one Back from the answer reaches Decide home; an open sheet keeps Back for itself.
  useBackToDecide(!(sheet?.open ?? false) && !confOpen);
  const openSheet = (variant: RecordVariant): void => setSheet({ variant, open: true, status: row.status });
  const closeSheet = (): void => {
    const wrote = sheet !== null && row.status !== sheet.status;
    setSheet((s) => (s === null ? s : { ...s, open: false }));
    // "Back to Decide": once the record sheet has written, the check is done and the user returns to the Decide tab.
    if (wrote) router.navigate(DECIDE_TAB_HREF);
  };

  const purchase = evaluation.purchase;
  const band = purchase?.band ?? result.band;
  const price = purchase === null ? '' : f.money(Number(purchase.whole));

  const check = useMemo(() => readStoredCheck(row.inputs).check, [row.inputs]);
  const aprText = purchase !== null && purchase.financed && check.pay.mode === 'plan' ? percentToText(check.pay.apr) || null : null;

  const strip = useMemo(() => (showHero ? fundingStrip(evaluation) : null), [showHero, evaluation]);
  const facts = useMemo(() => (showHero ? factRows(result) : []), [showHero, result]);
  const refund = showHero && refundHint({ stored: row.answer_v3, live: result, without: withoutRefunds?.result });
  const wholePlanTotal = useMemo(() => wholePlanTotalOf(row, evaluation), [row, evaluation]);
  const assume = assumptions(evaluation);
  const assumeText = t(assume.key, {
    amount: f.money(Number(assume.params.amount)),
    date: f.date(String(assume.params.date)),
  });

  const anotherPrice = (): void => {
    const newId = reopen(row);
    replaceOnce(purchaseHref(newId, { focus: 'price' }));
  };
  const checkAgain = (): void => {
    const newId = reopen(row);
    replaceOnce(answerHref(newId));
  };

  // 05.3-59 (D-24, D-27, D-31): the user's answers the result rests on, named once each; the confidence level is unchanged.
  const waivers = waiverRows(result.readiness?.waived, evaluation.month.paidByOther ?? [], evaluation.month.alwaysOther ?? [], evaluation.month.month);
  const note = waiverNote(waivers);
  let noteText: string | null = null;
  if (note !== null) {
    const one = note.params.text as WaiverText | undefined;
    noteText = one === undefined ? t(note.key, note.params) : t(note.key, { text: waiverText(t, f, one.key, one.params) });
  }

  const heroNode = (
    <>
      <AnswerHero
        evaluation={evaluation}
        busy={busy}
        focusRef={heroRef}
        extraChip={<ConfidenceChipV3 confidence={result.confidence} onPress={() => setConfOpen(true)} />}
      />
      {noteText === null ? null : (
        <Pressable accessibilityRole="button" accessibilityLabel={noteText} onPress={() => setConfOpen(true)} style={styles.note}>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{noteText}</Text>
        </Pressable>
      )}
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.canvas }]}>
      <AnswerHeader checkId={id} item={row.name.trim()} price={price} band={band} titleRef={titleRef} />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingHorizontal: space.screenH, paddingTop: space.groupGap, paddingBottom: space.groupGap }]}
      >
        {decided && row.answer_v3 !== null ? (
          <SavedAnswerLine stored={row.answer_v3} decidedAt={row.decided_at ?? row.updated_at} />
        ) : null}
        {savedTile === null ? null : <ChangedSinceSavedTile tile={savedTile} />}
        {openedTile === null ? null : <ChangedSinceOpenedTile tile={openedTile} />}
        {ready ? <NoticeTiles notices={result.notices} /> : null}

        {!ready ? (
          <>
            <NotReadyCard readiness={result.readiness} thisMonth={evaluation.month.month} />
            {row.answer_v3 === null ? null : (
              <SavedAnswerLine stored={row.answer_v3} decidedAt={row.decided_at ?? row.updated_at} variant="last" />
            )}
          </>
        ) : asking ? (
          <AskCard
            model={ask}
            onDone={() => setRise(true)}
            renderBody={(q, onSaved) =>
              renderQuestionBody(q.code, {
                question: q,
                checkId: id,
                userId: rc.userId ?? '',
                householdId: rc.householdId ?? '',
                onSaved,
              })
            }
          />
        ) : (
          <Rise key={rise ? 'rise' : 'still'} active={rise}>
            {heroNode}
          </Rise>
        )}

        {asking ? (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
            {t('decide.v3.ui.ask.savedAsYouGo')}
          </Text>
        ) : null}

        {showHero ? (
          <>
            <RefundHintTile show={refund} row={row} />
            <FundingStrip model={strip} />
            <FactRows rows={facts} />
            {result.code === 'needs_input' ? null : (
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{assumeText}</Text>
            )}
            {result.code === 'needs_input' ? (
              <NeedsInputCard lines={needsInputLines(result)} helpOffered={helpOffered(inputs)} checkId={id} />
            ) : null}
            <AnswerLinks checkId={id} code={result.code} band={band} wholePlanTotal={wholePlanTotal} />
          </>
        ) : null}
      </ScrollView>

      {showHero && !decided ? (
        <AnswerActionBar
          result={result}
          row={row}
          onBought={() => openSheet('bought')}
          onPlan={() => openSheet('plan')}
          onNotBuying={() => openSheet('pass')}
        />
      ) : null}
      {showHero && decided ? (
        <View
          style={[
            styles.bar,
            { backgroundColor: colors.canvas, borderTopColor: colors.line1, paddingBottom: Math.max(insets.bottom, space.tabBarPadBottomMin) },
          ]}
        >
          <Pill label={t('decide.v3.ui.answer.checkAgain')} variant="primary" onPress={checkAgain} />
          <Pill label={t('decide.v3.ui.answer.checkAnotherPrice')} variant="secondary" onPress={anotherPrice} />
        </View>
      ) : null}

      <ConfidenceSheetV3
        visible={confOpen}
        confidence={result.confidence}
        onClose={() => setConfOpen(false)}
        waivers={waivers}
        format={f}
        onAskAgain={(w) => clearWaiver(w.waiver, w.name)}
      />
      {sheet === null ? null : (
        <RecordSheet
          variant={sheet.variant}
          visible={sheet.open}
          onClose={closeSheet}
          row={row}
          evaluation={evaluation}
          aprText={aprText}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { gap: space.groupGap },
  note: { alignSelf: 'flex-start', marginTop: space.gapSm, maxWidth: '100%', minHeight: space.touchMin, justifyContent: 'center' },
  bar: { borderTopWidth: 1, paddingTop: space.gapMd, paddingHorizontal: space.cardPad, gap: space.gapSm },
});
