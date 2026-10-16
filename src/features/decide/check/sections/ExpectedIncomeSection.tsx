/**
 * 05-42 section 6, "With the expected income" (D-32): only when a raise is set. Collapsed summary is the one-line
 * outcome; expanded, the six figures behind it. The main verdict never uses it. Exported for 05-30, which places it.
 */
import React from 'react';
import { useT } from '@/i18n';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import { expectedIncomeCopy } from '../../copy/depthInputsCopy';
import { refText, type Translate } from '../refText';
import { TableRow, moneyOf, type SectionProps } from './sectionUi';

export function ExpectedIncomeSection(props: SectionProps) {
  const { computation, whole, currency, expanded, onToggle } = props;
  const t = useT() as Translate;
  const outcome = computation.status === 'logged' ? (computation.decision?.withExpectedIncome ?? null) : null;
  if (!outcome) return null;
  const fmt = moneyOf(whole, currency);
  const line = expectedIncomeCopy(outcome, fmt);
  if (!line) return null;
  const payback =
    outcome.payback.months === null
      ? t('decide.depth.income.rowNever', { months: outcome.payback.horizonMonths })
      : t('decide.depth.income.rowMonths', { count: outcome.payback.months });
  const rows: { key: string; label: string; value: string }[] = [
    { key: 'income', label: t('decide.depth.income.rows.income'), value: fmt(outcome.assessment.context.money.incomeBasis) },
    { key: 'left', label: t('decide.depth.income.rows.left'), value: fmt(outcome.assessment.left) },
    { key: 'payback', label: t('decide.depth.income.rows.payback'), value: payback },
    { key: 'total', label: t('decide.depth.income.rows.total'), value: fmt(outcome.payback.totalCost) },
    { key: 'state', label: t('decide.depth.income.rows.state'), value: t(`decide.depth.income.state.${outcome.assessment.state}`) },
    { key: 'sure', label: t('decide.depth.income.rows.sure'), value: t(`decide.depth.income.likelihood.${outcome.likelihood}`) },
  ];
  return (
    <CollapsibleSection title={t('decide.depth.income.section')} summary={refText(t, line)} expanded={expanded} onToggle={onToggle}>
      {rows.map((r) => (
        <TableRow key={r.key} label={r.label} value={r.value} />
      ))}
    </CollapsibleSection>
  );
}
