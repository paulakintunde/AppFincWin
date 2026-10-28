/**
 * Plan 05.2-24: "Your regular payments". Found payments (computed on the device, never stored) are marked Regular,
 * Not regular, or left unmarked. Each mark is saved at once with its own Undo toast, so the step has nothing left to
 * save and Next always works (owner decision). Only confirmed series count as regular (I34).
 */
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Text } from '@/ui/Text';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { ACCENT_TINT_OPACITY } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { useReadOnlyScope } from '@/ui/ReadOnlyScope';
import { hapticSelection } from '@/ui/haptics';
import { showToast } from '@/state/undoToast';
import { undoLabelText } from '@/i18n/undoLabel';
import { useConfirmRegularCandidate } from '@/data/mutations/seriesAttributes';
import { useAddDismissal } from '@/data/mutations/dismissals';
import type { NewRecurringSeries } from '@/db/recurringSeries';
import { useShouldStack } from '@/features/decide/ui/textFit';
import { Intro, Meta, TextButton, Why, useCopy, useNoWrapMoney, useReportReady, type Copy } from '@/features/income/steps/shared';
import type { SetupStepBodyProps, SetupStepHandle } from './types';
import { setupSheetActions, type RegularPreset } from './setupSheetHost';
import { useRegularCandidates, type CandidateRow } from './useRegularCandidates';

const PRESETS: readonly { preset: RegularPreset; labelKey: string }[] = [
  { preset: 'rent', labelKey: 'decide.setup.regular.pickRent' },
  { preset: 'utilities', labelKey: 'decide.setup.regular.pickUtilities' },
  { preset: 'phone', labelKey: 'decide.setup.regular.pickPhone' },
  { preset: 'insurance', labelKey: 'decide.setup.regular.pickInsurance' },
  { preset: 'childcare', labelKey: 'decide.setup.regular.pickChildcare' },
  { preset: 'subscriptions', labelKey: 'decide.setup.regular.pickSubscriptions' },
  { preset: 'transport', labelKey: 'decide.setup.regular.pickTransport' },
  { preset: 'other', labelKey: 'decide.setup.regular.pickOther' },
];

const FREQ_KEYS: Readonly<Record<string, string>> = {
  weekly: 'income.pay.freqWeekly',
  fortnightly: 'income.pay.freqFortnightly',
  monthly: 'income.pay.freqMonthly',
  quarterly: 'income.other.freqQuarterly',
  yearly: 'income.other.freqYearly',
};

interface MarkButtonProps {
  label: string;
  a11y: string;
  selected: boolean;
  disabled?: boolean;
  fill: boolean;
  onPress: () => void;
}

function MarkButton({ label, a11y, selected, disabled = false, fill, onPress }: MarkButtonProps) {
  const { colors, pairing } = useTheme();
  const readOnly = useReadOnlyScope();
  const off = readOnly || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected, disabled: off }}
      disabled={off}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [styles.mark, fill ? styles.markFill : styles.markFull, { backgroundColor: colors.fill1, opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.pill }]} /> : null}
      <Text style={{ ...textRole(pairing, 'label'), color: selected ? colors.accent : colors.ink, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

interface CardProps {
  row: CandidateRow;
  t: Copy;
  canWrite: boolean;
  onRegular: (row: CandidateRow) => void;
  onNotRegular: (row: CandidateRow) => void;
  onEdit: (row: CandidateRow) => void;
}

function CandidateCard({ row, t, canWrite, onRegular, onNotRegular, onEdit }: CardProps) {
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack();
  const noWrap = useNoWrapMoney(row.currency);
  const { candidate } = row;
  const frequency = t(FREQ_KEYS[row.freq] ?? 'income.pay.freqMonthly');
  const day = Number(candidate.anchorDate.slice(8, 10));
  const amount = noWrap(Number(candidate.amount));
  const stateWord = row.state === 'regular' ? t('decide.setup.regular.stateRegular') : row.state === 'notRegular' ? t('decide.setup.regular.stateNotRegular') : t('decide.setup.regular.notMarked');
  const style =
    row.state === 'unmarked'
      ? { backgroundColor: colors.surface, borderColor: colors.inkSoft1, borderStyle: 'dashed' as const }
      : row.state === 'regular'
        ? { backgroundColor: colors.surface, borderColor: colors.line2, borderStyle: 'solid' as const }
        : { backgroundColor: colors.fill2, borderColor: colors.fill2, borderStyle: 'solid' as const };
  return (
    <View style={[styles.card, style]}>
      <View
        accessible
        accessibilityLabel={t('decide.setup.regular.rowA11y', { name: candidate.name, amount, frequency, state: stateWord })}
        style={styles.head}
      >
        <View style={styles.headText}>
          <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{candidate.name}</Text>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
            {t('decide.setup.regular.rowMeta', { frequency, day })}
          </Text>
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 0 }}>
          {amount}
        </Text>
      </View>
      {row.state === 'unmarked' ? (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>{t('decide.setup.regular.notMarked')}</Text>
      ) : (
        <View style={[styles.stateChip, { backgroundColor: row.state === 'regular' ? colors.accentTint1 : colors.fill1 }]}>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: row.state === 'regular' ? colors.accent : colors.inkDim }}>{stateWord}</Text>
        </View>
      )}
      <View style={stacked ? styles.buttonsStacked : styles.buttonsRow}>
        <MarkButton
          label={t('decide.setup.regular.buttonRegular')}
          a11y={t('decide.setup.regular.markRegularA11y', { name: candidate.name })}
          selected={row.state === 'regular'}
          disabled={!canWrite || row.state === 'regular'}
          fill={!stacked}
          onPress={() => onRegular(row)}
        />
        <MarkButton
          label={t('decide.setup.regular.buttonNotRegular')}
          a11y={t('decide.setup.regular.markNotRegularA11y', { name: candidate.name })}
          selected={row.state === 'notRegular'}
          // A payment that is already a series is ended where series are edited, not by a dismissal here.
          disabled={!canWrite || row.state !== 'unmarked'}
          fill={!stacked}
          onPress={() => onNotRegular(row)}
        />
        <MarkButton label={t('decide.setup.regular.edit')} a11y={t('decide.setup.regular.editA11y', { name: candidate.name })} selected={false} fill={!stacked} onPress={() => onEdit(row)} />
      </View>
    </View>
  );
}

export const RegularStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function RegularStep({ onReadyChange }, ref) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const { rows, householdId, userId, timeZone } = useRegularCandidates();
  const confirmer = useConfirmRegularCandidate(householdId ?? '', userId ?? '');
  const dismisser = useAddDismissal(householdId ?? '', userId ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const canWrite = householdId !== undefined && userId !== undefined;

  // Next always works: every mark is already saved, and unmarked payments are simply not counted.
  useReportReady(onReadyChange, true, null, false);
  useImperativeHandle(ref, () => ({ save: () => ({ stepId: null }) }));

  const marked = rows.filter((r) => r.state !== 'unmarked').length;
  const anyUnmarked = rows.some((r) => r.state === 'unmarked');

  const markRegular = (row: CandidateRow): void => {
    if (!canWrite || row.accountId === null) {
      setupSheetActions().editRegular({ candidate: row.candidate });
      return;
    }
    const { candidate } = row;
    const series: NewRecurringSeries = {
      id: Crypto.randomUUID(),
      household_id: householdId,
      account_id: row.accountId,
      name: candidate.name,
      amount: Number(candidate.amount),
      currency: row.currency,
      category_id: row.categoryId,
      payment_type: null,
      freq: row.freq,
      anchor_date: candidate.anchorDate,
      time_zone: timeZone,
      end_date: null,
      occurrence_count: null,
      is_automatic: false,
    };
    const { stepId } = confirmer.confirm({
      series,
      attributes: candidate.direction === 'in' ? { counts_as: 'available' } : {},
      dismissalToClear: row.dismissal,
    });
    showToast({ kind: 'ordinary', text: undoLabelText('paymentMarkedRegular', { name: candidate.name }), stepId });
  };

  const markNotRegular = (row: CandidateRow): void => {
    if (!canWrite) return;
    const { stepId } = dismisser.dismiss({ payeeKey: row.candidate.key, direction: row.candidate.direction });
    showToast({ kind: 'ordinary', text: undoLabelText('paymentDismissed', { name: row.candidate.name }), stepId });
  };

  const edit = (row: CandidateRow): void => {
    setupSheetActions().editRegular(row.series !== null ? { series: row.series } : { candidate: row.candidate });
  };

  return (
    <View style={{ gap: space.groupGap }}>
      {rows.length > 0 ? (
        <>
          <Intro textKey="decide.setup.regular.intro" />
          <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t('decide.setup.regular.counter', { n: marked, m: rows.length })}</Text>
          <View style={{ gap: space.gapMd }}>
            {rows.map((row) => (
              <CandidateCard key={row.id} row={row} t={t} canWrite={canWrite} onRegular={markRegular} onNotRegular={markNotRegular} onEdit={edit} />
            ))}
          </View>
          {anyUnmarked ? <Meta text={t('decide.setup.regular.unmarkedLine')} /> : null}
        </>
      ) : (
        <View style={{ gap: space.gapSm }}>
          <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('decide.setup.regular.emptyTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.setup.regular.emptyBody')}</Text>
        </View>
      )}
      <TextButton label={t('decide.setup.regular.add')} onPress={() => setPickerOpen(true)} />
      <Why textKey="decide.setup.regular.why" />
      <Sheet visible={pickerOpen} onDismiss={() => setPickerOpen(false)} accessibilityLabel={t('decide.setup.regular.addTitle')}>
        <View style={{ gap: space.gapSm }}>
          <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('decide.setup.regular.addTitle')}</Text>
          {PRESETS.map((p) => (
            <Pressable
              key={p.preset}
              accessibilityRole="button"
              accessibilityLabel={t('decide.setup.regular.pickA11y', { name: t(p.labelKey) })}
              onPress={() => {
                setPickerOpen(false);
                setupSheetActions().addRegular(p.preset, p.preset === 'other' ? null : t(p.labelKey));
              }}
              style={({ pressed }) => [styles.pick, { backgroundColor: colors.fill1, opacity: pressed ? PRESSED_OPACITY : 1 }]}
            >
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t(p.labelKey)}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1.5, padding: space.cardPad, gap: space.gapSm },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.gapMd },
  headText: { flex: 1, flexShrink: 1, gap: 2 },
  stateChip: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: space.gapMd, paddingVertical: 4 },
  buttonsRow: { flexDirection: 'row', gap: space.gapSm },
  buttonsStacked: { gap: space.gapSm },
  mark: { minHeight: space.touchMin, borderRadius: radii.pill, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.gapMd, overflow: 'hidden' },
  markFill: { flex: 1 },
  markFull: { alignSelf: 'stretch' },
  pick: { minHeight: space.touchMin, borderRadius: radii.pill, justifyContent: 'center', paddingHorizontal: space.cardPad },
});
