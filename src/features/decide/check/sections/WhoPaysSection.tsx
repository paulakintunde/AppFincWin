/**
 * 05-16 section 3, "Who pays what": each member's day-one and monthly part of this purchase, from the engine's memberParts.
 * Omitted entirely (no empty frame) in personal scope or with one member, which is every household until Phase 8 (D-05, D-18).
 */
import React from 'react';
import { memberParts, type ResolvedShare } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import { useT } from '@/i18n';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import { TableRow, moneyOf, type SectionProps } from './sectionUi';

export interface WhoPaysSectionProps extends SectionProps {
  memberCount: number;
  memberNames: readonly string[];
  share: ResolvedShare;
  /** The whole day-one cost and the whole monthly cost of the purchase, in minor units. */
  dayOneTotal: number;
  monthlyTotal: number;
}

export function WhoPaysSection(props: WhoPaysSectionProps) {
  const { inputs, whole, exact, currency, expanded, onToggle, memberCount, memberNames, share, dayOneTotal, monthlyTotal } = props;
  const t = useT();
  if (inputs.scope !== 'household' || memberCount <= 1) return null;
  const day = memberParts(minorUnits(dayOneTotal), share);
  const month = memberParts(minorUnits(monthlyTotal), share);
  const fmtDay = moneyOf(whole, currency);
  const fmtMonth = moneyOf(exact, currency);
  return (
    <CollapsibleSection
      title={t('decide.section.whoTitle')}
      summary={t('decide.section.whoSummary', { count: memberCount })}
      expanded={expanded}
      onToggle={onToggle}
    >
      {share.weights.map((_, i) => {
        const name = memberNames[i] ?? String(i + 1);
        const dayText = fmtDay(day[i] ?? 0);
        const monthText = fmtMonth(month[i] ?? 0);
        return (
          <TableRow
            key={name + i}
            label={name}
            sub={`${t('decide.section.whoDayOne')} ${dayText}`}
            value={`${t('decide.section.whoMonthly')} ${monthText}`}
            a11yLabel={`${name}, ${t('decide.section.whoDayOne')} ${dayText}, ${t('decide.section.whoMonthly')} ${monthText}`}
          />
        );
      })}
    </CollapsibleSection>
  );
}
