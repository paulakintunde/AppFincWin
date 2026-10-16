/**
 * 05-15 section 1, "The month, line by line" (D-05, 04 D-38): Now and After columns from assessment.monthTable in exact
 * minor units, so each column adds up. Collapsed by default; renders nothing without a resolved logged verdict.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import type { MonthColumn } from '@/engine/decide';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import { Note, Tile, assessmentOf, moneyOf, type SectionProps } from './sectionUi';

type Line = { key: string; label: string; pick: (c: MonthColumn) => number; emphasis?: boolean };

export function MonthSection(props: SectionProps) {
  const { computation, inputs, whole, exact, currency, expanded, onToggle } = props;
  const t = useT();
  const { colors, pairing } = useTheme();
  const a = assessmentOf(computation);
  if (!a) return null;
  const fmtWhole = moneyOf(whole, currency);
  const fmtExact = moneyOf(exact, currency);
  const { now, after } = a.monthTable;
  const lines: Line[] = [
    { key: 'rowIncome', label: t('decide.section.rowIncome'), pick: (c) => c.income },
    { key: 'rowLiving', label: t('decide.section.rowLiving'), pick: (c) => c.living },
    { key: 'rowDebt', label: t('decide.section.rowDebt'), pick: (c) => c.debtPayments },
    { key: 'rowSaving', label: t('decide.section.rowSaving'), pick: (c) => c.savingInvesting },
    { key: 'rowThis', label: inputs.kind === 'invest' ? t('decide.section.rowContribution') : t('decide.section.rowRunning'), pick: (c) => c.thisPurchase },
    { key: 'rowLeft', label: t('decide.section.rowLeft'), pick: (c) => c.left, emphasis: true },
  ];
  const basis = t(a.context.money.basis === 'worst' ? 'decide.verdict.basisWorst' : 'decide.verdict.basisAverage');
  const closing =
    after.left < 0
      ? t('decide.section.monthShort', { amount: fmtExact(-after.left) })
      : t(a.context.money.basis === 'worst' ? 'decide.section.monthClosesWorst' : 'decide.section.monthClosesAverage', { amount: fmtExact(after.left) });
  return (
    <CollapsibleSection
      title={t('decide.section.monthTitle')}
      summary={t('decide.section.monthSummary', { now: fmtWhole(now.left), after: fmtWhole(after.left) })}
      expanded={expanded}
      onToggle={onToggle}
    >
      <Note>{t('decide.section.monthNote', { basis })}</Note>
      <View style={styles.head}>
        <Text style={[styles.cell, styles.first, { ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }]}>{t('decide.section.colLine')}</Text>
        <Text style={[styles.num, { ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }]}>{t('decide.section.colNow')}</Text>
        <Text style={[styles.num, { ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }]}>{t('decide.section.colAfter')}</Text>
      </View>
      {lines.map((l) => {
        const label = l.label;
        const nowText = fmtExact(l.pick(now));
        const afterText = fmtExact(l.pick(after));
        return (
          <View
            key={l.key}
            accessible
            accessibilityLabel={`${label}, ${t('decide.section.colNow')} ${nowText}, ${t('decide.section.colAfter')} ${afterText}`}
            style={[styles.row, { borderTopColor: colors.line2 }]}
          >
            <Text style={[styles.first, { ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink, fontWeight: l.emphasis ? '700' : undefined }]}>{label}</Text>
            <Text scale="capped" style={[styles.num, { ...textRole(pairing, 'label'), color: colors.inkDim }]}>{nowText}</Text>
            <Text scale="capped" style={[styles.num, { ...textRole(pairing, 'label'), color: l.emphasis && l.pick(after) < 0 ? colors.danger : colors.ink }]}>{afterText}</Text>
          </View>
        );
      })}
      <Tile>{closing}</Tile>
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: space.gapSm, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, minHeight: space.touchMin, borderTopWidth: StyleSheet.hairlineWidth },
  cell: { flexShrink: 1 },
  first: { flex: 1.3 },
  num: { flex: 1, textAlign: 'right' },
});
