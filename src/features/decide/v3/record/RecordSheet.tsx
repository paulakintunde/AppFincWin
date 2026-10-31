/**
 * 05.3-27 (DSV-13, UI-SPEC Record sheets): Bought (two steps), Plan it and Not buying, in one Sheet.
 * Bought: step A asks, with the exact lines that will be written (the only confirm in the phase); step B confirms in the
 * past tense with Undo and Back to Decide. Plan it and Not buying write at once and show their step B.
 * Every write goes through useRecordMutations (V3RecordProvider), which stores answer_v3 first. No toast is shown: the
 * sheet is the confirmation. Closing by backdrop or drag is the same as Back to Decide.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { Sheet } from '@/ui/Sheet';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { ReadOnlyScope } from '@/ui/ReadOnlyScope';
import { hapticSuccess } from '@/ui/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { space, useScreenInsets } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { focusAccessibility } from '@/shell/a11yFocus';
import { seenOf } from '@/engine/decide/v3';
import type { Evaluation } from '@/engine/decide/v3';
import type { DecideCheckRow, StoredSeenV3 } from '@/db/decideChecks';
import { useUndo } from '@/data/mutations/undo';
import { cancelCheckReminders } from '@/features/decide/notifications/waitReminder';
import { useRecordContext } from '@/features/record/useRecordContext';
import { WrittenList } from '../../ui/WrittenList';
import { useShouldStack } from '../../ui/textFit';
import { useV3Format } from '../shared/useV3Format';
import { recordLines } from '../model/recordLines';
import { useRecordMutations, type BoughtContext, type RecordArgs } from './recordMutations';
import { useBoughtContext } from './useBoughtContext';
import { useCheckWritesSettled } from './useCheckWritesSettled';

export type RecordVariant = 'bought' | 'plan' | 'pass';

export interface RecordSheetProps {
  variant: RecordVariant;
  visible: boolean;
  onClose(): void;
  row: DecideCheckRow;
  evaluation: Evaluation;
  /** The loan's rate as percent text; the Purchase carries none. */
  aprText?: string | null;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;
const K = 'decide.v3.ui.record.';
const MONEY_PARAMS: readonly string[] = ['amount', 'payment', 'after'];

function storedSeen(evaluation: Evaluation): StoredSeenV3 {
  const s = seenOf(evaluation.result);
  return { ...s, lineFacts: [...s.lineFacts], readyBy: s.readyBy === null ? null : { ...s.readyBy } } as StoredSeenV3;
}

export function RecordSheet({ variant, visible, onClose, row, evaluation, aprText }: RecordSheetProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const insets = useScreenInsets();
  const stacked = useShouldStack();
  const f = useV3Format();
  const rc = useRecordContext();
  const actions = useRecordMutations();
  const { undo } = useUndo();
  const boughtCtx = useBoughtContext(row, evaluation.purchase, aprText);
  // 05.3-74: writes wait for the check's own draft saves, so they use the inputs the user saw.
  const settled = useCheckWritesSettled(row.id);

  const [step, setStep] = useState<'A' | 'B'>(variant === 'bought' ? 'A' : 'B');
  const [stepId, setStepId] = useState<string | null>(null);
  const [reminder, setReminder] = useState<'set' | 'off' | 'none' | null>(null);
  // What was written (item and price at that moment); the sheet keeps showing it if the cache moves on.
  const [written, setWritten] = useState<{ item: string; price: number | null } | null>(null);
  const sentRef = useRef(false);
  const headingRef = useRef<React.ComponentRef<typeof Text>>(null);

  // Closed: the next opening starts fresh (state adjusted during render, so it settles in one extra pass).
  const first = variant === 'bought' ? 'A' : 'B';
  if (!visible && (step !== first || stepId !== null || reminder !== null || written !== null)) {
    setStep(first);
    setStepId(null);
    setReminder(null);
    setWritten(null);
  }

  const item = row.name.trim();
  const month = (boughtCtx?.today ?? rc.today).slice(0, 7);
  const purchase = evaluation.purchase;
  const price: number | null = purchase === null ? null : purchase.whole;

  // Plan it and Not buying carry no cash account; they write with the household's own context.
  const writeCtx = useMemo<BoughtContext>(
    () =>
      boughtCtx ?? {
        householdId: row.household_id,
        currency: rc.homeCurrency,
        timeZone: rc.timeZone,
        today: rc.today,
        cashAccountId: null,
        debtCategoryId: null,
        runningCostCategoryId: null,
        name: item,
        aprText: aprText ?? null,
      },
    [boughtCtx, row.household_id, rc.homeCurrency, rc.timeZone, rc.today, item, aprText]
  );
  const args = useMemo<RecordArgs>(
    () => ({ check: row, evaluation, seen: storedSeen(evaluation), ctx: writeCtx }),
    [row, evaluation, writeCtx]
  );

  const canRecord = variant !== 'bought' || (boughtCtx !== null && actions.canRecordBought({ ...args, ctx: boughtCtx }));
  const blockedReason = variant === 'bought' && !canRecord ? t(`${K}noAccount`) : null;

  // Plan it and Not buying write once, when the sheet opens. Closing re-arms it for the next check.
  useEffect(() => {
    if (!visible) {
      sentRef.current = false;
      return;
    }
    if (variant === 'bought' || sentRef.current || !settled) return;
    sentRef.current = true;
    setWritten({ item, price });
    if (variant === 'pass') {
      void Promise.resolve(actions.notBuying(args)).then(setStepId);
      return;
    }
    void actions.planIt({ ...args, goalTarget: price !== null && price > 0 ? price : null, reminderOn: true }).then((r) => {
      setReminder(r.reminder);
      setStepId(r.stepId);
    });
  }, [visible, variant, actions, args, price, item, settled]);

  // Step B of Bought: one Success haptic, announced politely.
  useEffect(() => {
    if (!visible || variant !== 'bought' || step !== 'B') return;
    hapticSuccess();
    AccessibilityInfo.announceForAccessibility(t(`${K}announced`));
  }, [visible, variant, step, t]);

  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => focusAccessibility(headingRef.current), 0);
    return () => clearTimeout(timer);
  }, [visible, step]);

  const confirm = useCallback(() => {
    if (sentRef.current || boughtCtx === null || !canRecord) return;
    sentRef.current = true;
    setWritten({ item, price });
    const sent = actions.recordBought({ ...args, ctx: boughtCtx });
    if (sent === null) {
      sentRef.current = false;
      return;
    }
    setStepId(sent.stepId);
    setStep('B');
  }, [actions, args, boughtCtx, canRecord, item, price]);

  const onUndo = useCallback(() => {
    if (stepId !== null) {
      undo({
        stepId,
        ownerId: row.created_by,
        householdId: row.household_id,
        labelKey: variant === 'plan' ? 'planSaved' : variant === 'pass' ? 'notBuyingSaved' : 'decisionWritten',
        labelParams: { name: item },
      });
      // D-21: a reopened check holds no wait or cooling-off reminder; the reconcile would clear it later, this does it now.
      if (variant !== 'bought') void cancelCheckReminders(row.id).catch(() => undefined);
    }
    onClose();
  }, [undo, stepId, variant, row.id, row.created_by, row.household_id, item, onClose]);

  const text = (key: string, params: Readonly<Record<string, string | number>>): string => {
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(params)) {
      if (MONEY_PARAMS.includes(k) && typeof v === 'number') out[k] = f.money(v);
      else if (k === 'month' && typeof v === 'string') out[k] = f.month(v);
      else if (k === 'every' && typeof v === 'string') out[k] = t(`${K}${v}`);
      else out[k] = v;
    }
    return t(`${K}${key}`, out);
  };

  const lines = useMemo(() => {
    if (purchase === null || variant !== 'bought') return [];
    return recordLines({ purchase, result: evaluation.result, item, month, done: step === 'B' }).map((l) => text(l.key, l.params));
    // text depends on f and t only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchase, evaluation.result, item, month, step, f, t]);

  const readyDate = evaluation.result.readyBy;
  const shownItem = written?.item ?? item;
  const shownPrice = written !== null ? written.price : price;
  const planLines: string[] = [
    shownPrice === null
      ? t(`${K}planLineNoPrice`, { item: shownItem })
      : t(`${K}planLine`, { item: shownItem, price: f.money(shownPrice) }),
  ];
  if (variant === 'plan') {
    if (evaluation.result.variant === 'payday' && reminder === 'set' && readyDate !== null) {
      planLines.push(t(`${K}reminderOnDate`, { date: f.date(readyDate.kind === 'date' ? readyDate.date : `${readyDate.month}-01`) }));
    } else {
      planLines.push(t(reminder === 'set' ? `${K}reminderOn` : `${K}reminderOff`));
    }
  }

  let title: string;
  let body: string | null;
  let shown: readonly string[];
  if (variant === 'bought') {
    title = step === 'A' ? t(`${K}boughtTitle`, { item }) : t(`${K}doneTitle`);
    body = step === 'A' ? t(`${K}boughtBody`, { item, month: f.month(month) }) : null;
    shown = lines;
  } else if (variant === 'plan') {
    title = t(`${K}planTitle`);
    body = t(`${K}planBody`);
    shown = planLines;
  } else {
    title = t(`${K}notTitle`);
    body = shownPrice === null ? t(`${K}notBodyNoPrice`) : t(`${K}notBody`, { price: f.money(shownPrice) });
    shown = [t(`${K}notLine`, { item: shownItem })];
  }

  const button = (node: React.ReactNode, key: string): React.JSX.Element => (
    <View key={key} style={stacked ? styles.stackedButton : styles.rowButton}>
      {node}
    </View>
  );

  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title}>
      {/* the sheet may open from a read-only check; its own buttons stay live */}
      <ReadOnlyScope.Provider value={false}>
        <View style={[styles.content, { paddingBottom: space.sheetPadBottom + insets.bottom }]}>
          <Text ref={headingRef} accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
            {title}
          </Text>
          {body !== null ? <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{body}</Text> : null}
          {shown.length > 0 ? (
            <View style={[styles.tile, { backgroundColor: colors.fill3 }]}>
              {variant === 'bought' ? (
                <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted, textTransform: 'uppercase' }}>
                  {t(`${K}written`)}
                </Text>
              ) : null}
              <WrittenList lines={shown} />
            </View>
          ) : null}
          {blockedReason !== null && step === 'A' ? (
            <Text accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'body'), fontSize: fontSize.s13_5, color: colors.inkDim }}>
              {blockedReason}
            </Text>
          ) : null}
          <View style={stacked ? styles.stack : styles.pair}>
            {variant === 'bought' && step === 'A'
              ? [
                  button(<Pill label={t(`${K}notYet`)} variant="secondary" onPress={onClose} />, 'not-yet'),
                  button(
                    <Pill
                      label={t(`${K}confirm`)}
                      variant="primary"
                      disabled={!canRecord || !settled}
                      accessibilityHint={blockedReason ?? undefined}
                      onPress={confirm}
                    />,
                    'confirm'
                  ),
                ]
              : [
                  stepId !== null ? button(<Pill label={t(`${K}undo`)} variant="secondary" onPress={onUndo} />, 'undo') : null,
                  button(<Pill label={t(`${K}backToDecide`)} variant="primary" onPress={onClose} />, 'back'),
                ]}
          </View>
        </View>
      </ReadOnlyScope.Provider>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.sheetCornerPad, gap: space.gapMd },
  tile: { borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: space.gapSm },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  stack: { flexDirection: 'column', gap: space.gapSm },
  rowButton: { flexGrow: 1, flexBasis: 0 },
  stackedButton: { alignSelf: 'stretch' },
});
