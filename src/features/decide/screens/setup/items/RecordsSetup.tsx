// 06.1-25 (D37, D37b, D-11, UX-23): setup item 6, Records. Three checks, each a row with a word status (not colour alone):
//   Last month complete  /  This month up to date (newest entry within 10 days)  /  every account says what it is for.
// "Done" is active only when all three hold; otherwise the button reads "Save and close" and the row stays open on the checklist.
// The checks come from the same facts the checklist reads (useSetupFacts), so this screen and the checklist can never disagree.
// An account's use is written through the Accounts mutation (one batch, one Undo); nothing is stored here.
// A brand-new person (no records at all) sees "No records yet" with the three ways forward instead of the checks.
// 06.1-45 (G-1, C-4, C-5): below the checks, "What's still open" lists every readiness item the engine names, with the same fix and
// answers as the answer screen (ReadinessFixList), led by an envelope summary row. Records is done only when that list is empty
// (owner GQ2), and "Save and close" with items still open says so. The writes that reach the rate-fetch door (the line skip and
// Grow's goal writer) are bound in the shell and passed in as `writes`, as on the answer screen.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { useSaveAccountUse } from '@/data/mutations/accountUse';
import { useSaveDecideAnswer } from '@/data/mutations/decideAnswers';
import { queryKeys } from '@/data/keys';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideV3 } from '@/data/queries/decideV3';
import type { AccountRow, TransactionRow } from '@/db/rows';
import type { LocalDate, ReadinessItem, ReadinessWaiver } from '@/engine/decide/v3';
import { AccountUseSheet } from '@/features/record/accounts/AccountUseSheet';
import { useRecordContext } from '@/features/record/useRecordContext';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { hapticLight } from '@/ui/haptics';
import { ReadinessFixList } from '../../answer/ReadinessFixList';
import { monthNameOf } from '../../home/YourMonthCard';
import { readinessFixRows, type ReadinessFixRow, type WaiverChoice } from '../../logic/readinessFixes';
import { EnvelopeAccountSheet, type SetEnvelopeAccount } from '../../sheets/EnvelopeAccountSheet';
import { footerFactsOf } from '../../home/useHomeFacts';
import { useSetupFacts } from '../useSetupProgress';
import { RadioRow, useSetupFormat } from './itemFields';
import { askedAccounts, choiceOfUse, previousMonthOf, recordChecks, accountUseOfChoice, USE_CHOICES, type UseChoice } from './othersLogic';
import { SetupItemFrame, useLeaveItem } from './SetupItemFrame';

const ACTIVITY = '/activity' as Href;
const IMPORT = '/import' as Href;
const QUICK_ESTIMATES = '/decide/setup/quick-estimates' as Href;
const NO_ITEMS: readonly ReadinessItem[] = [];

/** 06.1-45: the writes bound by the shell (features/decide may not import them; they reach the rate-fetch door). */
export interface RecordsWrites {
  /** Grow's goal writer for the envelope fix (D-54). */
  setEnvelopeAccount: SetEnvelopeAccount;
  /** Skips a pending line (useSkipOccurrence); returns the undo step id, or null when nothing was written. */
  skipLine: (row: TransactionRow, ownerId: string) => string | null;
}

/** The pending line a "It didn't happen" answer skips, from any cached transactions list of the household; null when not cached. */
function cachedPendingLine(qc: QueryClient, householdId: string, lineId: string): TransactionRow | null {
  for (const [, data] of qc.getQueriesData<unknown>({ queryKey: queryKeys.transactionsRoot(householdId) })) {
    if (!Array.isArray(data)) continue;
    const hit = (data as TransactionRow[]).find((r) => r !== null && typeof r === 'object' && r.id === lineId);
    if (hit !== undefined && hit.deleted_at == null && hit.status === 'pending') return hit;
  }
  return null;
}

/** With the line not cached, the same occurrence is answered by its waiver instead (the engine accepts it when no line can be skipped). */
function fallbackWaiver(item: ReadinessItem): ReadinessWaiver | null {
  if (item.seriesId === null || item.date === null) return null;
  if (item.kind === 'bill') return { kind: 'didnt_happen', seriesId: item.seriesId, date: item.date };
  if (item.kind === 'pay') return { kind: 'no_pay', seriesId: item.seriesId, date: item.date };
  return null;
}

export function RecordsSetup({ writes }: { writes: RecordsWrites }) {
  const t = useT();
  const router = useRouter();
  const leave = useLeaveItem();
  const { colors, pairing } = useTheme();
  const fmt = useSetupFormat();
  const rc = useRecordContext();
  const { facts, today, currency } = useSetupFacts();
  const v3 = useDecideV3();
  const accountsQ = useAccounts(rc.householdId ?? undefined);
  const saver = useSaveAccountUse(rc.userId ?? '');
  const [sheetFor, setSheetFor] = useState<AccountRow | null>(null);
  const qc = useQueryClient();
  const answers = useSaveDecideAnswer(rc.userId ?? '', rc.householdId ?? '');
  const [envelopeId, setEnvelopeId] = useState<string | null>(null);
  const readinessItems = v3.evaluation?.result.readiness?.items ?? NO_ITEMS;
  const fixRows = useMemo(() => (today === '' ? [] : readinessFixRows(readinessItems, today as LocalDate)), [readinessItems, today]);
  const envelopesOpen = fixRows.filter((r) => r.item.kind === 'envelopes').length;

  const asked = useMemo(() => (v3.inputs === null ? [] : askedAccounts(v3.inputs.accounts ?? [])), [v3.inputs]);
  const rowOf = (id: string): AccountRow | undefined => (accountsQ.data ?? []).find((a) => a.id === id);
  const footer = footerFactsOf(v3.inputs);

  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  // C-5: "Save and close" with items still open says what is open, then leaves; with none open it leaves silently as before.
  // 06.1-65: every write here is made at once (account use, answers), so nothing is left unsaved; the primary and "Save and close"
  // both say what is still open, then leave.
  const sayStillOpen = (): void => {
    if (fixRows.length > 0) showToast({ kind: 'ordinary', text: { key: 'decide.screens.setupOthers.records.stillOpen', params: { count: fixRows.length } } });
  };
  const saveAndClose = (): void => {
    sayStillOpen();
    leave();
  };

  const saveWaiver = (waiver: ReadinessWaiver): void => {
    const saved = answers.save({ kind: 'readiness_waiver', waiver, at: today as LocalDate });
    if (saved === null) return;
    hapticLight();
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.answer.notReady.saved' }, stepId: saved.stepId });
  };
  const onReadinessChoice = (fixRow: ReadinessFixRow, choice: WaiverChoice): void => {
    if (choice.waiver !== null) {
      saveWaiver(choice.waiver);
      return;
    }
    // markSkipped: skip the pending line itself when it is cached; otherwise answer the occurrence by its waiver.
    const line = choice.lineId === null || rc.householdId === null ? null : cachedPendingLine(qc, rc.householdId, choice.lineId);
    if (line !== null && rc.userId !== null) {
      const stepId = writes.skipLine(line, rc.userId);
      if (stepId === null) return;
      hapticLight();
      showToast({ kind: 'ordinary', text: { key: 'decide.screens.answer.notReady.saved' }, stepId });
      return;
    }
    const fallback = fallbackWaiver(fixRow.item);
    if (fallback !== null) saveWaiver(fallback);
  };
  const onReadinessFix = (fixRow: ReadinessFixRow): void => {
    if (fixRow.fix.kind === 'linkEnvelope') {
      if (fixRow.fix.envelopeId !== null) setEnvelopeId(fixRow.fix.envelopeId);
      return;
    }
    router.push(ACTIVITY);
  };

  // Not loaded yet: show the frame with the primary off, so nothing flickers between the two variants.
  if (facts === null) {
    return (
      <SetupItemFrame title={t('decide.screens.setupOthers.records.title')} why={t('decide.screens.setupOthers.records.why')} primaryLabel={t('decide.screens.common.saveAndClose')} primaryDisabled onSave={() => undefined} onLeave={leave}>
        <View />
      </SetupItemFrame>
    );
  }

  const checks = recordChecks(facts, today);
  const brandNew = footer.months === 0 && footer.entries === 0 && facts.newestEntryThisMonth === null && !facts.lastMonthComplete;
  const word = (ok: boolean): string => (ok ? t('decide.screens.setupOthers.records.complete') : t('decide.screens.setupOthers.records.notComplete'));
  const monthName = monthNameOf(previousMonthOf(today), fmt.locale);
  const sayCount = asked.filter((a) => a.use !== null).length;

  const chooseUse = (accountId: string, choice: UseChoice): void => {
    const row = rowOf(accountId);
    if (row === undefined) return;
    const use = accountUseOfChoice(choice);
    // "Savings or goals" also says which goal the money is kept for, so the account's own sheet picks it.
    if (use === null) {
      setSheetFor(row);
      return;
    }
    const result = saver.save({ account: row, use });
    if (result !== null) showToast({ kind: 'ordinary', text: { key: 'decide.accountUse.toastSaved' }, stepId: result.stepId });
  };

  const choiceLabel = (c: UseChoice): string => t(`decide.screens.setupOthers.records.accountUse.${c}`);

  if (brandNew) {
    return (
      <SetupItemFrame title={t('decide.screens.setupOthers.records.title')} why={t('decide.screens.setupOthers.records.why')} primaryLabel={t('decide.screens.common.saveAndClose')} onSave={() => undefined} onLeave={leave}>
        <View testID="records-empty" style={styles.block}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('decide.screens.setupOthers.records.emptyTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.screens.setupOthers.records.emptyBody')}</Text>
        </View>
        <Pill variant="primary" label={t('decide.screens.setupOthers.records.importStatement')} onPress={() => router.push(IMPORT)} />
        <Pill variant="secondary" label={t('decide.screens.setupOthers.records.addAsYouGo')} onPress={() => router.push(ACTIVITY)} />
        <Pill variant="secondary" label={t('decide.screens.setupOthers.records.fromEstimates')} onPress={() => router.push(QUICK_ESTIMATES)} />
      </SetupItemFrame>
    );
  }

  const upTo = fmt.date(facts.recordsUpTo ?? today);
  // GQ2: done only when the three D-11 checks hold and the engine names nothing still open.
  const allDone = checks.allDone && fixRows.length === 0;
  const rowStyle = [styles.row, { backgroundColor: colors.surface, borderColor: colors.line2 }];
  return (
    <SetupItemFrame
      title={t('decide.screens.setupOthers.records.title')}
      why={t('decide.screens.setupOthers.records.why')}
      primaryLabel={allDone ? t('decide.screens.common.done') : t('decide.screens.common.saveAndClose')}
      onSave={sayStillOpen}
      onLeave={leave}
      onSaveAndClose={saveAndClose}
    >
      <View style={styles.block}>
        <View testID="check-last" accessible accessibilityLabel={`${t('decide.screens.setupOthers.records.lastMonth', { month: monthName })}, ${word(checks.lastMonth)}`} style={rowStyle}>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{t('decide.screens.setupOthers.records.lastMonth', { month: monthName })}</Text>
          <Text style={{ ...textRole(pairing, 'bodyStrong'), color: checks.lastMonth ? colors.ink : colors.warn1 }}>{word(checks.lastMonth)}</Text>
        </View>

        <View style={[rowStyle, styles.column]}>
          <View testID="check-this" accessible accessibilityLabel={`${t('decide.screens.setupOthers.records.thisMonth')}, ${checks.thisMonth ? t('decide.screens.setupOthers.records.upTo', { date: upTo }) : t('decide.screens.setupOthers.records.notComplete')}`} style={styles.row2}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{t('decide.screens.setupOthers.records.thisMonth')}</Text>
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: checks.thisMonth ? colors.ink : colors.warn1 }}>
              {checks.thisMonth ? t('decide.screens.setupOthers.records.upTo', { date: upTo }) : t('decide.screens.setupOthers.records.notComplete')}
            </Text>
          </View>
          {!checks.thisMonth ? <Text style={small}>{t('decide.screens.setupOthers.records.upTo', { date: upTo })}</Text> : null}
          <Pressable
            testID="add-since"
            accessibilityRole="link"
            accessibilityLabel={t('decide.screens.setupOthers.records.addSince')}
            onPress={() => router.push(ACTIVITY)}
            style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
          >
            <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.setupOthers.records.addSince')}</Text>
          </Pressable>
        </View>

        <View style={[rowStyle, styles.column]}>
          <View
            testID="check-accounts"
            accessible
            accessibilityLabel={`${t('decide.screens.setupOthers.records.accounts')}, ${word(checks.accounts)}`}
            style={styles.row2}
          >
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{t('decide.screens.setupOthers.records.accounts')}</Text>
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: checks.accounts ? colors.ink : colors.warn1 }}>{word(checks.accounts)}</Text>
          </View>
          {checks.accounts ? (
            <Text style={small}>{t('decide.screens.setupOthers.records.accountsSay', { count: sayCount })}</Text>
          ) : (
            asked.map((a) => {
              const row = rowOf(a.id);
              const current = choiceOfUse(a.use);
              const name = row?.name ?? '';
              return (
                <View key={a.id} testID={`account-${a.id}`} style={styles.block}>
                  <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.setupOthers.records.accountFor', { name })}</Text>
                  <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.setupOthers.records.accountFor', { name })}>
                    {USE_CHOICES.map((c) => (
                      <RadioRow key={c} label={choiceLabel(c)} selected={current === c} onPress={() => chooseUse(a.id, c)} />
                    ))}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>

      {fixRows.length > 0 ? (
        <View testID="records-open" style={styles.block}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.setupOthers.records.openTitle')}</Text>
          {envelopesOpen > 0 ? (
            <Text testID="records-envelopes" style={{ ...textRole(pairing, 'body'), color: colors.warn1 }}>
              {t('decide.screens.setupOthers.records.envelopesRow', { count: envelopesOpen })}
            </Text>
          ) : null}
          <ReadinessFixList
            rows={fixRows}
            asOf={today as LocalDate}
            money={(minor) => fmt.money(minor, currency)}
            date={(d) => fmt.date(d)}
            monthName={(ym) => monthNameOf(ym, fmt.locale)}
            onFix={onReadinessFix}
            onChoice={onReadinessChoice}
          />
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.setupOthers.records.moreMonthsQ')}</Text>
        <Pill variant="secondary" label={t('decide.screens.setupOthers.records.importStatement')} onPress={() => router.push(IMPORT)} />
        <Text testID="months-so-far" style={small}>
          {footer.months >= 3 ? t('decide.screens.setupOthers.records.progressDone') : t('decide.screens.setupOthers.records.progress', { count: footer.months })}
        </Text>
        {!allDone ? <Text style={small}>{t('decide.screens.setupOthers.records.openNote')}</Text> : null}
      </View>

      {sheetFor === null ? null : <AccountUseSheet visible account={sheetFor} balance={null} onClose={() => setSheetFor(null)} />}
      {envelopeId === null ? null : (
        <EnvelopeAccountSheet goalId={envelopeId} visible onClose={() => setEnvelopeId(null)} setAccount={writes.setEnvelopeAccount} />
      )}
    </SetupItemFrame>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
  column: { flexDirection: 'column', alignItems: 'stretch' },
  row: { borderRadius: radii.card, borderWidth: 1.5, padding: space.cardPad, gap: space.gapSm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  row2: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.gapMd },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
