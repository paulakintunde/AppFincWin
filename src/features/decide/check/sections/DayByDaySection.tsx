/**
 * 05-42 section 3, "Day by day, next 90 days" (D-26): the cash path chart and its text alternative, collapsed by default.
 * Summarised 'Lowest with this: {amt} on {date}'. A pre-existing dip before payday is stated as a neutral fact (04 D-59,
 * stacked wording when other open checks are applied). With no confirmed pay series the section asks for one and opens
 * Record's entry sheet on a money-in line. Exported for 05-30, which places it; renders nothing without a resolved verdict.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
import { Note, assessmentOf, moneyOf, type SectionBodyProps, type SectionProps } from './sectionUi';

export interface DayByDaySectionProps extends SectionProps {
  stack: StackSelection;
  formatDate: (localDate: string) => string;
}

export interface DayByDayBodyProps extends SectionBodyProps {
  stack: StackSelection;
  formatDate: (localDate: string) => string;
}

export function DayByDayBody(props: DayByDayBodyProps) {
  const { computation, whole, currency, formatDate } = props;
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const a = assessmentOf(computation);
  if (!a) return null;
  const fmt = moneyOf(whole, currency);
  const report = a.cashPath;
  const copy = cashPathCopy(report, fmt, formatDate);

  if (!copy.available) {
    // D-74: declarative body and a link to where a recurring series is made
    const link = t('decide.fold.cashPath.recurringLink');
    return (
      <View>
        <Note>{t('decide.fold.cashPath.unavailableBody')}</Note>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={link}
          onPress={() => openEntry({ kind: 'new', direction: 'in' })}
          style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent, flexShrink: 1 }}>{link}</Text>
        </Pressable>
      </View>
    );
  }

  const stackedApplied = computation.decision ? computation.decision.stacked.filter((s) => s.status === 'applied').length : 0;
  const tight = report.status === 'available' ? report.tightBeforePayday : null;
  const factRef = cashTightFactCopy(tight, stackedApplied, fmt, formatDate);
  return (
    <View>
      <CashPathChart report={report} reserve={a.context.limits.reserve} whole={{ formatMoney: (n) => fmt(n) }} formatDate={formatDate} />
      {factRef ? (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted, paddingTop: space.gapSm }}>{refText(t, factRef)}</Text>
      ) : null}
    </View>
  );
}

export function DayByDaySection(props: DayByDaySectionProps) {
  const { computation, whole, currency, expanded, onToggle, formatDate } = props;
  const t = useT() as Translate;
  const a = assessmentOf(computation);
  if (!a) return null;
  const copy = cashPathCopy(a.cashPath, moneyOf(whole, currency), formatDate);
  const summary = copy.available ? refText(t, copy.summary) : t('decide.fold.cashPath.unavailablePreview');
  return (
    <CollapsibleSection title={t('decide.depth.cashPath.section')} summary={summary} expanded={expanded} onToggle={onToggle}>
      <DayByDayBody {...props} />
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
