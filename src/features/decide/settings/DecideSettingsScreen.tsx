/**
 * Plan 05.2-34 (DSU-13, UI-SPEC "Decide settings"): the setup answers in five section cards, each row with its value and
 * what it changes. A row opens only that step (the setup stepper in edit-one-step mode); Emergency fund and Unspent money
 * open their sheets. Reset clears the setup answers only (not account use, records, payments, loans or envelopes) behind
 * a confirm, with one Undo. A "Rough" chip and "Finish setup" show while a needed step is unanswered.
 *
 * Reads only, plus the reset write. The route that gates it on the account lives in src/shell/decide/SettingsRoute.tsx.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { Text } from '@/ui/Text';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { currencyCode, minorUnits } from '@/engine/money';
import { useResetDecideSetup } from '@/data/mutations/decideSetup';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { StateChip } from '../ui/StateChip';
import { EmergencyFundSheet } from '../setup/EmergencyFundSheet';
import { SettingsRow } from '../setup/SettingsRow';
import { firstUnansweredNeeded, isNeeded, setupStatus, type SetupSection, type SetupStepKey } from '../setup/setupFlow';
import { UnspentSheet } from '../setup/UnspentSheet';
import { settingsRows, type SettingsRowModel, type SettingsValue } from './settingsRows';
import { SomethingChangedSheet } from './SomethingChangedSheet';
import { targetOf, type ChangeId } from './somethingChanged';
import { useSettingsData } from './useSettingsData';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const SECTION_KEY: Record<SetupSection, string> = {
  income: 'decide.setup.shell.sectionIncome',
  regular: 'decide.setup.shell.sectionRegular',
  spending: 'decide.setup.shell.sectionSpending',
  money: 'decide.setup.shell.sectionMoney',
  answers: 'decide.setup.shell.sectionAnswers',
};

const stepHref = (step: SetupStepKey): Href => `/decide/setup?only=${step}` as Href;
const finishHref = (step: SetupStepKey): Href => `/decide/setup?startAt=${step}` as Href;

export function DecideSettingsScreen(): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const loaded = useSettingsData();
  const fmt = useMoneyFormatter(false, loaded?.currency ?? rc.homeCurrency);
  const reset = useResetDecideSetup(rc.userId ?? '');
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [unspentOpen, setUnspentOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [changedOpen, setChangedOpen] = useState(false);

  const currency = loaded?.currency ?? rc.homeCurrency;
  const format = {
    money: (minor: number, cur?: string) => fmt.formatMoney({ amount: minorUnits(minor), currency: currencyCode(cur ?? currency) }),
    date: (iso: string) => fmt.formatDate(iso),
    word: (key: string, params?: Record<string, string | number>) => t(key, params),
  };

  const groups = loaded === null ? [] : settingsRows(loaded.facts, loaded.data, format);
  const rough = loaded !== null && setupStatus(loaded.facts) === 'rough';
  const firstLeft = loaded === null ? null : firstUnansweredNeeded(loaded.facts);

  const valueText = (v: SettingsValue): string | null => (v === null ? null : 'text' in v ? v.text : t(v.key, v.params));

  const open = (row: SettingsRowModel): void => {
    if (row.action === 'emergency') setEmergencyOpen(true);
    else if (row.action === 'unspent') setUnspentOpen(true);
    else pushOnce(stepHref(row.step));
  };

  const pickChange = (id: ChangeId): void => {
    const target = targetOf(id, {
      hasRegularPay: loaded !== null && isNeeded('pay', loaded.facts),
      fullMonths: loaded?.facts.fullMonthsOfRecords,
    });
    if (target.kind === 'sheet') setEmergencyOpen(true);
    else pushOnce(target.href as Href);
  };

  const doReset = (): void => {
    setResetOpen(false);
    const result = reset.reset();
    if (result !== null) showToast({ kind: 'ordinary', text: { key: 'decide.settings.toastReset' }, stepId: result.stepId });
  };

  return (
    <DetailScreen title={t('decide.settings.title')}>
      <View style={[styles.card, styles.entry, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('decide.settings.changed.a11yEntry')}
          onPress={() => setChangedOpen(true)}
          style={({ pressed }) => [styles.entryRow, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <View style={styles.entryText}>
            <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('decide.settings.changed.entry')}</Text>
            <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.s13_5, color: colors.inkMuted }}>{t('decide.settings.changed.entrySub')}</Text>
          </View>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.chevron, { borderColor: colors.inkFaint }]} />
        </Pressable>
      </View>
      {rough ? (
        <View style={styles.roughLine}>
          <StateChip tone="adjust" label={t('decide.settings.rough')} />
          {firstLeft !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('decide.settings.finishSetup')}
              onPress={() => pushOnce(finishHref(firstLeft))}
              style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textDecorationLine: 'underline' }}>{t('decide.settings.finishSetup')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {groups.map((g) => (
        <View key={g.section} style={styles.group}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: 1.2 }}>
            {t(SECTION_KEY[g.section])}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
            {g.rows.map((row, i) => (
              <View key={row.id} style={i > 0 ? [styles.divider, { borderTopColor: colors.line1 }] : undefined}>
                <SettingsRow
                  label={t(row.labelKey)}
                  value={valueText(row.value)}
                  notSetLabel={t('decide.settings.notSet')}
                  effect={t(row.effectKey)}
                  needed={row.needed}
                  neededLabel={t('decide.settings.needed')}
                  onPress={() => open(row)}
                />
              </View>
            ))}
          </View>
        </View>
      ))}
      {loaded === null ? null : (
        <View style={[styles.card, styles.group, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('decide.settings.reset')}
            onPress={() => setResetOpen(true)}
            style={({ pressed }) => [styles.reset, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
          >
            <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.danger }}>{t('decide.settings.reset')}</Text>
          </Pressable>
        </View>
      )}
      <ConfirmSheet
        visible={resetOpen}
        title={t('decide.settings.resetTitle')}
        body={t('decide.settings.resetBody')}
        cancelLabel={t('decide.settings.resetKeep')}
        confirmLabel={t('decide.settings.resetConfirm')}
        destructive
        onCancel={() => setResetOpen(false)}
        onConfirm={doReset}
      />
      <SomethingChangedSheet visible={changedOpen} onClose={() => setChangedOpen(false)} onPick={pickChange} />
      <EmergencyFundSheet visible={emergencyOpen} onClose={() => setEmergencyOpen(false)} />
      <UnspentSheet
        visible={unspentOpen}
        onClose={() => setUnspentOpen(false)}
        onSetThem={() => {
          setUnspentOpen(false);
          pushOnce(stepHref('accountUse'));
        }}
      />
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  roughLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.gapMd, paddingTop: space.gapMd },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
  group: { marginTop: space.groupGap, gap: space.gapSm },
  card: { borderRadius: radii.card, borderWidth: 1, paddingHorizontal: space.cardPad },
  divider: { borderTopWidth: 1 },
  entry: { marginTop: space.gapMd },
  entryRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.gapMd, paddingVertical: space.rowPad },
  entryText: { flex: 1, gap: 2 },
  chevron: { width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, transform: [{ rotate: '45deg' }] },
  reset: { minHeight: 64, justifyContent: 'center', paddingVertical: space.rowPad },
});
