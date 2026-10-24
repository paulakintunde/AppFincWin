// 05-116 (D-96, UI-SPEC R17.5, R17.7): the "Needs a look" sheet. One entry per homeProblems entry, in order, each with
// its title, an "Affects: ..." line and ONE action (or the declarative no-action line for offline). Entries are the
// caller's live list, so a fixed problem disappears and the sheet hides itself when nothing is left. The fixing sheets
// are stacked inside this sheet's tree: RoughFiguresSheet, the shipped FailedWritesSheet and the card terms sheet.
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type HostInstance } from 'react-native';
import type { Href } from 'expo-router';
import { useSaveCardTerms, type CardTermsInput } from '@/data/mutations/decideLinks';
import { useAccounts } from '@/data/queries/accounts';
import { useDebts } from '@/data/queries/decide';
import type { DecideSettingsRow } from '@/db/decideSettings';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { focusAccessibility } from '@/shell/a11yFocus';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { FailedWritesSheet } from '@/ui/FailedWritesSheet';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { CardMinimumSheet } from '../check/steps/step2/CardMinimumSheet';
import type { SnapshotResult } from '../snapshot/types';
import { POTS_HREF } from './checkHref';
import { syncLabelText } from './HomeNoticeRow';
import type { ProblemAction, ProblemEntry } from './homeProblems';
import { RoughFiguresSheet } from './RoughFiguresSheet';

/** The You screen focuses its Home currency row on this query (YouScreen). */
export const CURRENCIES_HREF = '/you?focus=currencies' as Href;

type Translate = ReturnType<typeof useT>;
type Stack = { kind: 'rough' } | { kind: 'failed' } | { kind: 'card'; accountId: string } | null;

export interface HomeProblemsSheetProps {
  /** The live homeProblems entries. The sheet hides when the list is empty. */
  entries: readonly ProblemEntry[];
  visible: boolean;
  onClose: () => void;
  source: SnapshotResult | null;
  settings: DecideSettingsRow | null;
  userId: string | null;
  currency: string;
}

/** 'YYYY-MM-DD' as a short date. Calendar parts only, so no timezone shifts the day. */
function rateDateText(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

interface EntryText {
  title: string;
  affects: string | null;
  actionLabel: string | null;
}

function entryText(t: Translate, e: ProblemEntry): EntryText {
  switch (e.id) {
    case 'no_figures':
      return { title: t('decide.home.problems.noMonth.title'), affects: t('decide.home.problems.noMonth.affects'), actionLabel: t('decide.home.problems.noMonth.action') };
    case 'missing_rate': {
      const affects =
        e.variant === 'lines'
          ? t('decide.home.problems.rate.affectsLines', { count: e.rowCount })
          : e.variant === 'card_limit'
            ? t('decide.home.problems.rate.affectsCardLimit')
            : e.variant === 'pots'
              ? t('decide.home.problems.affectsPots', { count: e.potCount })
              : t('decide.home.problems.rate.affectsChecks', { count: e.checkCount, currency: e.currency });
      // The card-limit gap is the USD rate to the home currency.
      const currency = e.variant === 'card_limit' ? 'USD' : e.currency;
      return { title: t('decide.home.problems.rate.title', { currency }), affects, actionLabel: t('decide.home.problems.rate.action') };
    }
    case 'failed_saves':
      return { title: t('decide.home.problems.failed', { count: e.count }), affects: t('decide.home.problems.recordsOnDevice'), actionLabel: t('decide.home.problems.failedAction') };
    case 'conflicts':
      return { title: t('decide.home.problems.conflict', { count: e.count }), affects: t('decide.home.problems.recordsOnDevice'), actionLabel: t('decide.home.problems.conflictAction') };
    case 'card_minimum':
      return { title: t('decide.home.problems.cardMin.title', { card: e.cardName }), affects: t('decide.home.problems.cardMin.affects'), actionLabel: t('decide.home.problems.cardMin.action') };
    case 'stale_rate':
      return {
        title: t('decide.home.problems.stale.title', { currency: e.currency, date: rateDateText(e.rateDate) }),
        affects: t('decide.home.problems.stale.affects', { currency: e.currency }),
        actionLabel: t('decide.home.problems.stale.action'),
      };
    case 'pot_past_due':
      return {
        title: t('decide.home.problems.potPastDue', { count: e.count }),
        affects: t('decide.home.problems.potPastDueAffects'),
        actionLabel: t('decide.home.problems.potPastDueAction'),
      };
    case 'sync':
      return { title: syncLabelText(t, e.label), affects: t('decide.home.problems.offline.affects'), actionLabel: null };
  }
}

function entryKey(e: ProblemEntry): string {
  switch (e.id) {
    case 'missing_rate':
      return `missing_rate:${e.variant}:${e.variant === 'card_limit' ? '' : e.currency}`;
    case 'card_minimum':
      return `card_minimum:${e.accountId}`;
    case 'stale_rate':
      return `stale_rate:${e.currency}`;
    default:
      return e.id;
  }
}

export function HomeProblemsSheet({ entries, visible, onClose, source, settings, userId, currency }: HomeProblemsSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [stack, setStack] = useState<Stack>(null);
  const titleRef = useRef<React.ComponentRef<typeof Text>>(null);
  const title = t('decide.home.problems.title');

  const texts = useMemo(() => entries.map((e) => entryText(t, e)), [entries, t]);

  const runAction = (act: ProblemAction): void => {
    switch (act.kind) {
      case 'add_rough':
        setStack({ kind: 'rough' });
        return;
      case 'exchange_rates':
        onClose();
        pushOnce(CURRENCIES_HREF);
        return;
      case 'review_changes':
      case 'review_edits':
        setStack({ kind: 'failed' });
        return;
      case 'pots':
        onClose();
        pushOnce(POTS_HREF);
        return;
      case 'card_minimum':
        setStack({ kind: 'card', accountId: act.accountId });
        return;
    }
  };

  const close = (): void => {
    setStack(null);
    onClose();
  };

  // The sheet hides once nothing is left; a fixing sheet opened from it keeps it up until that sheet closes.
  const open = visible && (entries.length > 0 || stack !== null);

  const titleStyle = { ...textRole(pairing, 'sheetTitle'), color: colors.ink };
  const entryTitle = { ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink };
  const meta = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const actionStyle = { ...textRole(pairing, 'label'), color: colors.accent };

  return (
    <Sheet visible={open} onDismiss={close} accessibilityLabel={title}>
      <View style={styles.header}>
        <Text
          ref={titleRef}
          accessibilityRole="header"
          style={[titleStyle, styles.title]}
          onLayout={() => focusAccessibility(titleRef.current as HostInstance | null)}
        >
          {title}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('decide.home.problems.close')} onPress={close} style={styles.close}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.home.problems.close')}</Text>
        </Pressable>
      </View>
      <SheetScroll>
        {entries.map((entry, index) => {
          const text = texts[index]!;
          const group = text.affects === null ? text.title : t('decide.home.problems.entryA11y', { title: text.title, affects: text.affects });
          return (
            <View
              key={entryKey(entry)}
              testID={`problem-${entryKey(entry)}`}
              style={[styles.entry, index > 0 && { borderTopWidth: 1, borderTopColor: colors.fill2 }]}
            >
              <View accessible accessibilityLabel={group} style={styles.entryText}>
                <Text style={entryTitle}>{text.title}</Text>
                {text.affects !== null ? <Text style={meta}>{t('decide.home.problems.affects', { what: text.affects })}</Text> : null}
              </View>
              {entry.action !== null && text.actionLabel !== null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={text.actionLabel}
                  onPress={() => runAction(entry.action as ProblemAction)}
                  style={styles.action}
                >
                  <Text style={actionStyle}>{text.actionLabel}</Text>
                </Pressable>
              ) : (
                <Text style={meta}>{t('decide.home.problems.offline.note')}</Text>
              )}
            </View>
          );
        })}
      </SheetScroll>
      <RoughFiguresSheet visible={stack?.kind === 'rough'} userId={userId} currency={currency} settings={settings} onClose={() => setStack(null)} />
      {stack?.kind === 'failed' ? <FailedWritesSheet visible onClose={() => setStack(null)} /> : null}
      {stack?.kind === 'card' ? <CardMinimumHost accountId={stack.accountId} source={source} onClose={() => setStack(null)} /> : null}
    </Sheet>
  );
}

/** The card terms sheet with the same wiring CheckFlowScreen gives it; mounted only while it is open. */
function CardMinimumHost({ accountId, source, onClose }: { accountId: string; source: SnapshotResult | null; onClose: () => void }) {
  const rc = useRecordContext();
  const householdId = rc.householdId;
  const accounts = useAccounts(householdId ?? undefined).data;
  const debts = useDebts(householdId ?? undefined).data;
  const cardTerms = useSaveCardTerms();
  const card = source?.cards.find((c) => c.accountId === accountId) ?? null;
  if (card === null) return null;

  const save = (terms: CardTermsInput): void => {
    const account = accounts?.find((a) => a.id === accountId);
    if (rc.userId !== null && householdId !== null && account !== undefined) {
      const existing = card.terms.debtId === null ? null : (debts?.find((d) => d.id === card.terms.debtId) ?? null);
      cardTerms.save({ userId: rc.userId, householdId, accountId, existing, currency: account.currency, accountName: account.name, terms });
    }
    onClose();
  };
  return <CardMinimumSheet visible terms={card.terms} onSave={save} onClose={onClose} />;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: space.touchMin },
  title: { flexShrink: 1 },
  close: { minHeight: space.touchMin, justifyContent: 'center' },
  entry: { paddingVertical: space.gapMd, gap: space.gapSm },
  entryText: { gap: 2 },
  action: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
