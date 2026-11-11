// 06.1-25 (D37, D37b, D-11, UX-23): setup item 6, Records. Three checks, each a row with a word status (not colour alone):
//   Last month complete  /  This month up to date (newest entry within 10 days)  /  every account says what it is for.
// "Done" is active only when all three hold; otherwise the button reads "Save and close" and the row stays open on the checklist.
// The checks come from the same facts the checklist reads (useSetupFacts), so this screen and the checklist can never disagree.
// An account's use is written through the Accounts mutation (one batch, one Undo); nothing is stored here.
// A brand-new person (no records at all) sees "No records yet" with the three ways forward instead of the checks.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useT } from '@/i18n';
import { useSaveAccountUse } from '@/data/mutations/accountUse';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideV3 } from '@/data/queries/decideV3';
import type { AccountRow } from '@/db/rows';
import { AccountUseSheet } from '@/features/record/accounts/AccountUseSheet';
import { useRecordContext } from '@/features/record/useRecordContext';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { monthNameOf } from '../../home/YourMonthCard';
import { footerFactsOf } from '../../home/useHomeFacts';
import { useSetupFacts } from '../useSetupProgress';
import { RadioRow, useSetupFormat } from './itemFields';
import { askedAccounts, choiceOfUse, previousMonthOf, recordChecks, accountUseOfChoice, USE_CHOICES, type UseChoice } from './othersLogic';
import { SETUP_HOME, SetupItemFrame } from './SetupItemFrame';

const ACTIVITY = '/activity' as Href;
const IMPORT = '/import' as Href;
const QUICK_ESTIMATES = '/decide/setup/quick-estimates' as Href;

export function RecordsSetup() {
  const t = useT();
  const router = useRouter();
  const { colors, pairing } = useTheme();
  const fmt = useSetupFormat();
  const rc = useRecordContext();
  const { facts, today } = useSetupFacts();
  const v3 = useDecideV3();
  const accountsQ = useAccounts(rc.householdId ?? undefined);
  const saver = useSaveAccountUse(rc.userId ?? '');
  const [sheetFor, setSheetFor] = useState<AccountRow | null>(null);

  const asked = useMemo(() => (v3.inputs === null ? [] : askedAccounts(v3.inputs.accounts ?? [])), [v3.inputs]);
  const rowOf = (id: string): AccountRow | undefined => (accountsQ.data ?? []).find((a) => a.id === id);
  const footer = footerFactsOf(v3.inputs);

  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const leave = (): void => router.replace(SETUP_HOME);

  // Not loaded yet: show the frame with the primary off, so nothing flickers between the two variants.
  if (facts === null) {
    return (
      <SetupItemFrame title={t('decide.screens.setupOthers.records.title')} why={t('decide.screens.setupOthers.records.why')} primaryLabel={t('decide.screens.common.saveAndClose')} primaryDisabled onPrimary={leave} onBack={leave} onSaveAndClose={leave}>
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
      <SetupItemFrame title={t('decide.screens.setupOthers.records.title')} why={t('decide.screens.setupOthers.records.why')} primaryLabel={t('decide.screens.common.saveAndClose')} onPrimary={leave} onBack={leave} onSaveAndClose={leave}>
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
  const rowStyle = [styles.row, { backgroundColor: colors.surface, borderColor: colors.line2 }];
  return (
    <SetupItemFrame
      title={t('decide.screens.setupOthers.records.title')}
      why={t('decide.screens.setupOthers.records.why')}
      primaryLabel={checks.allDone ? t('decide.screens.common.done') : t('decide.screens.common.saveAndClose')}
      onPrimary={leave}
      onBack={leave}
      onSaveAndClose={leave}
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

      <View style={styles.block}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.setupOthers.records.moreMonthsQ')}</Text>
        <Pill variant="secondary" label={t('decide.screens.setupOthers.records.importStatement')} onPress={() => router.push(IMPORT)} />
        <Text testID="months-so-far" style={small}>
          {footer.months >= 3 ? t('decide.screens.setupOthers.records.progressDone') : t('decide.screens.setupOthers.records.progress', { count: footer.months })}
        </Text>
        {!checks.allDone ? <Text style={small}>{t('decide.screens.setupOthers.records.openNote')}</Text> : null}
      </View>

      {sheetFor === null ? null : <AccountUseSheet visible account={sheetFor} balance={null} onClose={() => setSheetFor(null)} />}
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
