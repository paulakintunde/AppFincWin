/**
 * 05-42 section 3, "Day by day, next 90 days" (D-26): the cash path chart and its text alternative, collapsed by default.
 * Summarised 'Lowest with this: {amt} on {date}'. A pre-existing dip before payday is stated as a neutral fact (04 D-59,
 * stacked wording when other open checks are applied). With no confirmed pay series the section asks for one and opens
 * Record's entry sheet on a money-in line. Exported for 05-30, which places it; renders nothing without a resolved verdict.
 */
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { openEntry } from '@/features/record/entry/entryHost';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import { CashPathChart } from '../../charts/CashPathChart';
import { cashPathCopy, cashTightFactCopy } from '../../copy/depthVerdictCopy';
import type { StackSelection } from '../../snapshot/types';
import { refText, type Translate } from '../refText';
import { Note, assessmentOf, moneyOf, type SectionProps } from './sectionUi';

export interface DayByDaySectionProps extends SectionProps {
  stack: StackSelection;
  formatDate: (localDate: string) => string;
}

export function DayByDaySection(props: DayByDaySectionProps) {
  const { computation, whole, currency, expanded, onToggle, formatDate } = props;
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const a = assessmentOf(computation);
  if (!a) return null;
  const fmt = moneyOf(whole, currency);
  const report = a.cashPath;
  const copy = cashPathCopy(report, fmt, formatDate);

  if (!copy.available) {
    return (
      <CollapsibleSection title={t('decide.depth.cashPath.section')} summary={refText(t, copy.summary)} expanded={expanded} onToggle={onToggle}>
        <Note>{refText(t, copy.body)}</Note>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={refText(t, copy.link)}
          onPress={() => openEntry({ kind: 'new', direction: 'in' })}
          style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{refText(t, copy.link)}</Text>
        </Pressable>
      </CollapsibleSection>
    );
  }

  const stackedApplied = computation.decision ? computation.decision.stacked.filter((s) => s.status === 'applied').length : 0;
  const tight = report.status === 'available' ? report.tightBeforePayday : null;
  const factRef = cashTightFactCopy(tight, stackedApplied, fmt, formatDate);
  return (
    <CollapsibleSection title={t('decide.depth.cashPath.section')} summary={refText(t, copy.summary)} expanded={expanded} onToggle={onToggle}>
      <CashPathChart
        report={report}
        reserve={a.context.limits.reserve}
        whole={{ formatMoney: (n) => fmt(n) }}
        formatDate={formatDate}
      />
      {factRef ? (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted, paddingTop: space.gapSm }}>
          {refText(t, factRef)}
        </Text>
      ) : null}
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
