/**
 * 05.3-31 (DSV-12, D-17, D-57): "Help me check this". Five rough figures for a user with no fully recorded month. They are
 * prefilled from this month's records where those exist, saved as the rough_* settings through the queued settings write
 * (home-currency stamp via stampSettingsPatch), and the answer then reads "Rough, from your figures" by the engine's
 * rough_figures reason. The route only mounts this where helpOffered(inputs) is true.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useRootNavigationState, type Href } from 'expo-router';
import { useDecideSettings } from '@/data/queries/decide';
import { useUpdateDecideSettings } from '@/data/mutations/decideSettings';
import type { DecideSettingsPatch } from '@/db/decideSettings';
import type { V3Inputs } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { useRecordContext } from '@/features/record/useRecordContext';
import { getAnalytics } from '@/services/analytics';
import type { NavStateLike } from '@/shell/backHistory/navLocation';
import { returnToTab } from '@/shell/navigation/returnToTab';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { space, useScreenInsets } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { MAX_INPUT_MINOR } from '../../snapshot/checkInputs';
import { PrefillNote } from '../../setup/PrefillNote';
import { MoneyInput } from '../../ui/MoneyInput';
import { stampSettingsPatch } from '../shared/settingsPatch';

type Translate = (key: string, options?: Record<string, unknown>) => string;
const ACTIVITY_HREF = '/activity' as Href;

export interface HelpFigures {
  income: number | null;
  spent: number | null;
  saving: number | null;
  debt: number | null;
  invest: number | null;
}

const NONE: HelpFigures = { income: null, spent: null, saving: null, debt: null, invest: null };
const positive = (n: number): number | null => (n > 0 ? n : null);

/**
 * What this month's records already say. Income, spending and loan payments come from the lines the records hold for
 * the current month; saving and investing stay empty unless the user typed them before (the stored rough figures).
 * `fromRecords` is true when any field was filled from this month's lines.
 */
export function prefillOf(inputs: V3Inputs): { figures: HelpFigures; fromRecords: boolean } {
  const month = inputs.months.find((m) => m.month === inputs.asOf.slice(0, 7));
  let income = 0;
  let spent = 0;
  let debt = 0;
  for (const l of month?.lines ?? []) {
    if (l.status !== 'paid') continue;
    const amount = Number(l.amount);
    if (l.role === 'income' || l.role === 'other_in') income += amount;
    else if (l.role === 'spending' || l.role === 'other_out') spent += amount;
    else if (l.role === 'refund') spent -= amount;
    else if (l.role === 'debt_payment') debt += amount;
  }
  const rough = inputs.rough;
  const fromRecords = income > 0 || spent > 0 || debt > 0;
  return {
    fromRecords,
    figures: {
      income: positive(income) ?? (rough === null ? null : positive(Number(rough.income))),
      spent: positive(spent) ?? (rough === null ? null : positive(Number(rough.expenses))),
      saving: rough === null ? null : positive(Number(rough.saving)),
      debt: positive(debt) ?? (rough === null ? null : positive(Number(rough.debt))),
      invest: rough === null ? null : positive(Number(rough.invest)),
    },
  };
}

const valid = (n: number | null): boolean => n === null || (Number.isSafeInteger(n) && n >= 0 && n <= MAX_INPUT_MINOR);

export function HelpScreen({ inputs }: { id: string; inputs: V3Inputs }): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const insets = useScreenInsets();
  const rc = useRecordContext();
  // UAT gap 33: help is an outer-stack screen; router.navigate to a tab would push a second (tabs).
  const navState = useRootNavigationState() as unknown as NavStateLike | undefined;
  const settings = useDecideSettings(rc.userId ?? undefined).data ?? null;
  const mutation = useUpdateDecideSettings(rc.userId ?? '');
  const currency = String(inputs.currency);
  const [start] = useState(() => prefillOf(inputs));
  const [value, setValue] = useState<HelpFigures>(start.figures ?? NONE);

  const fields = [value.income, value.spent, value.saving, value.debt, value.invest];
  const canSave = rc.userId !== null && fields.every(valid) && ((value.income ?? 0) > 0 || (value.spent ?? 0) > 0);

  const save = () => {
    if (!canSave) return;
    const patch: DecideSettingsPatch = {
      rough_income: value.income ?? 0,
      rough_spending: value.spent ?? 0,
      rough_saving: value.saving ?? 0,
      rough_debt: value.debt ?? 0,
      rough_invest: value.invest ?? 0,
      rough_as_of: inputs.asOf,
    };
    mutation.update(stampSettingsPatch(patch, settings, currency));
    getAnalytics().track('decide_help_used', {});
    router.back();
  };

  const field = (key: keyof HelpFigures, label: string) => (
    <MoneyInput
      value={value[key]}
      currency={currency}
      onChange={(n) => setValue((v) => ({ ...v, [key]: n }))}
      label={label}
      accessibilityLabel={label}
      boxed
    />
  );

  return (
    <DetailScreen title={t('decide.v3.ui.help.header')} scroll={false}>
      <ScrollView
        style={styles.fill}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.column, { paddingHorizontal: space.screenH }]}
      >
        <Text style={{ ...textRole(pairing, 'sheetTitle'), fontSize: fontSize.sheetTitle, color: colors.ink }} accessibilityRole="header">
          {t('decide.v3.ui.help.title')}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.v3.ui.help.intro')}</Text>
        {start.fromRecords ? <PrefillNote text={t('decide.v3.ui.help.fromRecords')} /> : null}
        {field('income', t('decide.v3.ui.help.income'))}
        {field('spent', t('decide.v3.ui.help.spent'))}
        {field('saving', t('decide.v3.ui.help.saving'))}
        {field('debt', t('decide.v3.ui.help.debt'))}
        {field('invest', t('decide.v3.ui.help.invest'))}
      </ScrollView>
      <View style={[styles.bar, { backgroundColor: colors.canvas, paddingBottom: insets.bottom + space.gapMd, paddingHorizontal: space.screenH }]}>
        <Pill label={t('decide.v3.ui.help.cta')} variant="primary" disabled={!canSave} onPress={save} />
        <Pill label={t('decide.v3.ui.help.update')} variant="secondary" onPress={() => returnToTab(ACTIVITY_HREF, navState)} />
      </View>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space.gapMd, paddingBottom: space.groupGap },
  bar: { gap: space.gapSm, paddingTop: space.gapMd },
});
