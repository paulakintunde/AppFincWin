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
import { useShouldStack } from '../../ui/textFit';
import { monthFigure } from '../../copy/monthFigure';
import { basisVariantKey, basisWordKey, monthClosesKey } from '../../copy/basisKey';
import { refText, type Translate } from '../refText';
import { Note, Tile, assessmentOf, moneyOf, type SectionProps } from './sectionUi';

type Line = { key: string; label: string; pick: (c: MonthColumn) => number; emphasis?: boolean };

export function MonthBody(props: SectionProps) {
  const { computation, inputs, exact, currency } = props;
  const t = useT();
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack();
  const a = assessmentOf(computation);
  if (!a) return null;
  const fmtExact = moneyOf(exact, currency);
  // D-106: the result row's cells are worded free / overspent through the shared helper; the other rows stay plain numbers
  const cellText = (l: Line, c: MonthColumn): string =>
    l.emphasis ? refText(t as Translate, monthFigure(l.pick(c), fmtExact)) : fmtExact(l.pick(c));
  const { now, after } = a.monthTable;
  const lines: Line[] = [
    { key: 'rowIncome', label: t('decide.section.rowIncome'), pick: (c) => c.income },
    { key: 'rowLiving', label: t('decide.section.rowLiving'), pick: (c) => c.living },
    { key: 'rowDebt', label: t('decide.section.rowDebt'), pick: (c) => c.debtPayments },
    { key: 'rowSaving', label: t('decide.section.rowSaving'), pick: (c) => c.savingInvesting },
    // D-101: pots' set-aside sits between saving and this purchase; hidden while it is 0 in both columns
    ...(now.setAside === 0 && after.setAside === 0
      ? []
      : [{ key: 'rowPots', label: t('decide.section.monthPots'), pick: (c: MonthColumn) => c.setAside }]),
    { key: 'rowThis', label: inputs.kind === 'invest' ? t('decide.section.rowContribution') : t('decide.section.rowRunning'), pick: (c) => c.thisPurchase },
    { key: 'rowLeft', label: t('decide.section.rowLeft'), pick: (c) => c.left, emphasis: true },
  ];
  const mb = a.context.money.basis;
  const tr = t as Translate;
  const basis = mb === 'month' ? '' : tr(basisWordKey(mb));
  const closing =
    after.left < 0
      ? t('decide.section.monthShort', { amount: fmtExact(-after.left) })
      : tr(monthClosesKey(mb), { amount: fmtExact(after.left) });
  return (
    <View>
      <Note>{tr(basisVariantKey('decide.section.monthNote', mb), { basis })}</Note>
      {stacked ? null : (
        <View style={styles.head}>
          <Text style={[styles.cell, styles.first, { ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }]}>
            {t('decide.section.colLine')}
          </Text>
          <Text style={[styles.num, { ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }]}>{t('decide.section.colNow')}</Text>
          <Text style={[styles.num, { ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }]}>
            {t('decide.section.colAfter')}
          </Text>
        </View>
      )}
      {lines.map((l) => {
        const label = l.label;
        const nowText = cellText(l, now);
        const afterText = cellText(l, after);
        return (
          <View
            key={l.key}
            accessible
            accessibilityLabel={`${label}, ${t('decide.section.colNow')} ${nowText}, ${t('decide.section.colAfter')} ${afterText}`}
            style={[stacked ? styles.rowStacked : styles.row, { borderTopColor: colors.line2 }]}
          >
            <Text
              style={[
                stacked ? undefined : styles.first,
                { ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink, fontWeight: l.emphasis ? '700' : undefined },
              ]}
            >
              {label}
            </Text>
            {stacked ? (
              <Text
                scale="capped"
                style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: l.emphasis && l.pick(after) < 0 ? colors.danger : colors.inkDim }}
              >
                {`${t('decide.section.colNow')} ${nowText} · ${t('decide.section.colAfter')} ${afterText}`}
              </Text>
            ) : (
              <>
                <Text
                  scale="capped"
                  style={[styles.num, { ...textRole(pairing, 'label'), color: l.emphasis && l.pick(now) < 0 ? colors.danger : colors.inkDim }]}
                >
                  {nowText}
                </Text>
                <Text
                  scale="capped"
                  style={[styles.num, { ...textRole(pairing, 'label'), color: l.emphasis && l.pick(after) < 0 ? colors.danger : colors.ink }]}
                >
                  {afterText}
                </Text>
              </>
            )}
          </View>
        );
      })}
      <Tile>{closing}</Tile>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: space.gapSm, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, minHeight: space.touchMin, borderTopWidth: StyleSheet.hairlineWidth },
  rowStacked: { minHeight: space.touchMin, justifyContent: 'center', paddingVertical: space.gapSm, borderTopWidth: StyleSheet.hairlineWidth },
  cell: { flexShrink: 1 },
  first: { flex: 1.3 },
  num: { flex: 1, textAlign: 'right' },
});
