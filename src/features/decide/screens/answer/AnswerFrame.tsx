// 06.1-14 (CO-D-64 (4), CO-D-119, UX-01, UX-29): the one answer layout every N board and D20/D21 uses. Reading order, for the eye and the
// screen reader alike: top bar, notices (unsaved first, only when sent), verdict card, fact lines, options, the "More detail" slot, basis
// sentence, first caveat only, caveat line, "What this can't see", footer, and last the action bar. Pure composition; nothing is written.
// 06.1-66 (H-5): the same parts every time. Not ready (readiness not met, or the engine's "More needed" ask, OQ-66-2) is one layout:
// the first item, the slot ("What you told Decide"), then "I'm not buying it" and "Delete this check" (FQ6); no pay or When controls
// and no buy or save until there is a verdict (CS-11). A decided check shows its outcome line in place of the action bar (FQ8).
// 06.1-68 (CF-3): while the verdict is being worked out again it dims and says "Updating…"; (CB-11) answered readiness rows read
// "Saved, updating…" until the engine drops them.
// 06.1-79 (DN-4 residual): the "Updating…" line keeps its one-line slot (opacity and text change only), so the answer never shifts.
// 06.1-67 (H-6, DS-3): short line first. One notice above the verdict (splitNotices: the one that changes the answer most); the
// verdict, the first fact, one short missing-figures line whose More opens Give it more to go on, then Why? for every other fact
// and notice (FactLines).
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { Evaluation, LocalDate, Purpose, Result, YearMonth } from '@/engine/decide/v3';
import { money as makeMoney } from '@/engine/money';
import { PRESSED_OPACITY, space, useScreenInsets } from '@/theme/layout';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Text } from '@/ui/Text';
import { ActionBar } from './ActionBar';
import { AnswerLoadingBody } from './AnswerLoading';
import { AnswerTopBar, type AnswerTopBarProps, type PayMode, type WhenChoice } from './AnswerTopBar';
import { FactLines } from './FactLines';
import type { ReadinessFixRow, WaiverChoice } from '../logic/readinessFixes';
import type { Line } from '../logic/sayResult';
import { splitNotices } from '../logic/answerLines';
import { LegalBlock } from './LegalBlock';
import { OptionChips, type OptionKey } from './OptionChips';
import { ErrorCard, NotReadyCard, NotReadyExits, OfflineCard, OutcomeLine } from './StatusCards';
import { VerdictCard } from './VerdictCard';
import { useSaid, type UseSaidOptions } from './useSaid';

export type AnswerAction =
  | { kind: 'back' }
  | { kind: 'newCheck' }
  | { kind: 'pay'; mode: PayMode }
  | { kind: 'when'; when: WhenChoice }
  | { kind: 'bought' }
  | { kind: 'saveFor' }
  | { kind: 'notBuying' }
  | { kind: 'retry' }
  | { kind: 'finishSetup' }
  | { kind: 'fromEstimates' }
  | { kind: 'deleteCheck' }
  | { kind: 'openPast' }
  /** 06.1-67 (CS-4): the missing-figures line's More: open Give it more to go on. */
  | { kind: 'giveMore' };

/** What the frame needs to know about the check, already written for the screen. */
export interface AnswerCheckView {
  name: string;
  priceText: string;
  pay: PayMode;
  when: WhenChoice;
  dateText?: string | null;
  purpose: Purpose | null;
  /** The options present for this check (cheaper only with a cheaper price, installments only on a cash check). */
  options: readonly OptionKey[];
  /** V3Inputs.region, for the free-help link. */
  country?: string | null;
  /** 06.1-66 (CB-7): the next payday as a short date; null hides the payday chip. */
  paydayText?: string | null;
  /** 06.1-66 (FQ8): set once the check is decided ("Bought on Nov 12."); the action bar and the Not ready exits give way to it. */
  outcome?: string | null;
}

/** 06.1-66 (OQ-66-2, DS-2): readiness not met and the engine's "More needed" ask are the same not-ready state, never a verdict (D-52). */
export function isNotReady(result: Result | null): boolean {
  return result !== null && (result.readiness?.ready === false || result.code === 'needs_input');
}

export interface AnswerFrameProps {
  check: AnswerCheckView;
  evaluation: Evaluation | null;
  status?: 'loading' | 'error' | 'ready';
  /** Set when the device is offline: the date the records run up to, as written. */
  offlineDate?: string | null;
  said: UseSaidOptions;
  onAction: (action: AnswerAction) => void;
  onOption: (key: OptionKey) => void;
  onCantSee: () => void;
  /** 06.1-23: extra content under a fact or missing line (factAction buttons, Fix links). */
  renderAfterFact?: (line: Line, index: number) => React.ReactNode;
  /** The "More detail" rows (plan 23). */
  children?: React.ReactNode;
  /** 06.1-44 (G-1, C-2): the named readiness items for the not-ready card (readinessFixRows). Absent = none named. */
  readinessRows?: readonly ReadinessFixRow[];
  /** D-57 (C-1): true only while quick estimates can count (estimatesCanAnswer). Absent = false: no quick-estimates control. */
  canUseEstimates?: boolean;
  onReadinessFix?: (row: ReadinessFixRow) => void;
  onReadinessChoice?: (row: ReadinessFixRow, choice: WaiverChoice) => void;
  /** 06.1-68 (CF-3): the shown verdict is a step behind the check in hand (useCheckEngine.updating). Absent = false. */
  updating?: boolean;
  /** 06.1-68 (CB-11): readiness rows answered on this screen and not yet dropped by the engine. Absent = none. */
  answeredRows?: ReadonlySet<string>;
}

const NO_ROWS: readonly ReadinessFixRow[] = [];
/** 06.1-68 (CF-3): how far the verdict dims while it updates (the same step the pressed state uses). */
const UPDATING_OPACITY = PRESSED_OPACITY;

/** "November" for 2026-11, in the device locale (the same words YourMonthCard uses). */
function monthNameIn(locale: string): (ym: YearMonth) => string {
  return (ym) => new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1)));
}

export function AnswerFrame({
  check,
  evaluation,
  status = 'ready',
  offlineDate = null,
  said,
  onAction,
  onOption,
  onCantSee,
  renderAfterFact,
  children,
  readinessRows = NO_ROWS,
  canUseEstimates = false,
  onReadinessFix,
  onReadinessChoice,
  updating = false,
  answeredRows,
}: AnswerFrameProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  // 06.1-49 (A-ANS-1, C-7): the frame starts below the status bar, so Back and New check are never drawn under it.
  const insets = useScreenInsets();
  const fmt = useMoneyFormatter(said.showCents ?? true, said.currency);
  const result = status === 'ready' ? (evaluation?.result ?? null) : null;
  const lines = useSaid(result, said);

  const top: AnswerTopBarProps = {
    name: check.name,
    priceText: check.priceText,
    pay: check.pay,
    when: check.when,
    dateText: check.dateText ?? null,
    paydayText: check.paydayText ?? null,
    onBack: () => onAction({ kind: 'back' }),
    onNewCheck: () => onAction({ kind: 'newCheck' }),
    onPay: (mode) => onAction({ kind: 'pay', mode }),
    onWhen: (when) => onAction({ kind: 'when', when }),
  };
  const retry = (): void => onAction({ kind: 'retry' });
  const outcome = check.outcome ?? null;

  let body: React.ReactNode = null;
  let showActions = false;
  if (status === 'error') {
    body = <ErrorCard item={check.name} onRetry={retry} />;
  } else if (result !== null && isNotReady(result)) {
    // D-52: a not-ready result is never a verdict.
    // 06.1-44 (C-1): quick estimates only when they can count; otherwise the card names the item with its fix and answers.
    // 06.1-66 (OQ-66-1): the first item only; a "More needed" ask with no readiness row names its first missing figure.
    const firstMissing = lines.missing[0];
    body = (
      <>
        <NotReadyCard
          rows={readinessRows}
          missing={readinessRows.length === 0 && firstMissing !== undefined ? { text: firstMissing.text, after: renderAfterFact?.(firstMissing, lines.facts.length) ?? null } : null}
          canUseEstimates={canUseEstimates}
          asOf={said.today as LocalDate}
          money={(minor) => fmt.formatMoney(makeMoney(minor, said.currency))}
          date={(d) => fmt.formatDate(d)}
          monthName={monthNameIn(fmt.locale)}
          onFix={(row) => onReadinessFix?.(row)}
          onChoice={(row, choice) => onReadinessChoice?.(row, choice)}
          answered={answeredRows}
          onFinishSetup={() => onAction({ kind: 'finishSetup' })}
          onFromEstimates={() => onAction({ kind: 'fromEstimates' })}
        />
        {children !== undefined ? (
          <View testID="answer-detail" style={styles.group}>
            {children}
          </View>
        ) : null}
        {outcome === null ? <NotReadyExits onNotBuying={() => onAction({ kind: 'notBuying' })} onDelete={() => onAction({ kind: 'deleteCheck' })} /> : null}
      </>
    );
  } else if (result !== null) {
    // D-68: a short plan judged by cash reads the one-off rows, like a payment made once.
    const once = check.pay === 'cash' || result.facts.some((f) => f.code === 'short_plan_from_cash');
    showActions = true;
    // DS-3: at most one notice above the verdict; the rest open under the facts' Why?.
    const notices = splitNotices(lines.notices);
    body = (
      <>
        {notices.lead !== null ? (
          <View testID="answer-notices" style={styles.group}>
            <Text testID={`answer-notice-${notices.lead.code}`} style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
              {notices.lead.text}
            </Text>
          </View>
        ) : null}
        {/* 06.1-79 (DN-4 residual): the "Updating…" line keeps its one line of space whether or not it shows, so the verdict and its
            rows never move when an update starts or lands (a tap right after cannot land on the wrong row). Out of an update the line
            holds a no-break space, is see-through and hidden from screen readers; the change of text is what the live region reads. */}
        <View
          testID="answer-updating-slot"
          accessibilityElementsHidden={!updating}
          importantForAccessibility={updating ? 'auto' : 'no-hide-descendants'}
        >
          <Text
            testID={updating ? 'answer-updating' : undefined}
            accessibilityLiveRegion="polite"
            style={[{ ...textRole(pairing, 'label'), color: colors.inkDim }, updating ? null : styles.updatingIdle]}
          >
            {updating ? t('decide.screens.answer.updating') : NO_BREAK_SPACE}
          </Text>
        </View>
        <View testID="answer-verdict-area" accessibilityState={{ busy: updating }} style={[styles.verdict, updating ? styles.updating : null]}>
          <VerdictCard code={result.code} variant={result.variant} once={once} values={lines.verdictValues} lead={lines.afterBuy.lead?.text ?? null} boughtOn={outcome === null ? (lines.afterBuy.boughtOn?.text ?? null) : null} />
          <FactLines
            facts={lines.facts}
            notices={notices.rest}
            missingCount={lines.missing.length}
            onMissingMore={() => onAction({ kind: 'giveMore' })}
            country={check.country ?? null}
            renderAfter={renderAfterFact}
          />
        </View>
        <OptionChips present={check.options} purpose={check.purpose} onOption={onOption} />
        {children !== undefined ? (
          <View testID="answer-detail" style={styles.group}>
            {children}
          </View>
        ) : null}
        <LegalBlock basis={lines.basis} caveat={lines.caveat} caveatFigures={lines.caveatFigures} onCantSee={onCantSee} />
      </>
    );
  } else {
    // 06.1-49 (A-ANS-2): loading, or ready with the deferred evaluation not in yet. Never a blank body.
    body = <AnswerLoadingBody />;
  }

  const showOutcome = outcome !== null && result !== null;
  const showBar = showActions || showOutcome;
  return (
    <View testID="answer-frame" style={[styles.frame, { backgroundColor: colors.canvas, paddingTop: insets.top }]}>
      {/* 06.1-62 (CB-3): with no action bar the last line (the legal link) must clear the Android nav bar too; the bar pads itself. */}
      <ScrollView contentContainerStyle={[styles.content, showBar ? null : { paddingBottom: space.screenH + insets.bottom }]}>
        <AnswerTopBar {...top} showControls={showActions} />
        {offlineDate !== null ? <OfflineCard date={offlineDate} onRetry={retry} /> : null}
        {body}
      </ScrollView>
      {showOutcome ? (
        <OutcomeLine text={outcome} onOpenPast={() => onAction({ kind: 'openPast' })} />
      ) : showActions ? (
        <ActionBar onBought={() => onAction({ kind: 'bought' })} onSaveFor={() => onAction({ kind: 'saveFor' })} onNotBuying={() => onAction({ kind: 'notBuying' })} />
      ) : null}
    </View>
  );
}

/** 06.1-79: holds the Updating… line's one line of height while no update runs. */
const NO_BREAK_SPACE = String.fromCharCode(0xa0);

const styles = StyleSheet.create({
  frame: { flex: 1 },
  content: { padding: space.screenH, gap: space.groupGap, flexGrow: 1 },
  group: { gap: space.gapSm },
  verdict: { gap: space.groupGap },
  updating: { opacity: UPDATING_OPACITY },
  updatingIdle: { opacity: 0 },
});
