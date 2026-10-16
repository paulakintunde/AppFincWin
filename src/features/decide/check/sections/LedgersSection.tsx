/**
 * 05-15 section 2, "Where it lands": the five ledgers (04 D-38) with a 6px dot and the direction word beside the colour,
 * never colour alone. Collapsed by default; renders nothing without a resolved logged verdict.
 */
import React from 'react';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import { LEDGER_DESC, LEDGER_LABEL } from '../../copy/codeMaps';
import { Dot, Note, TableRow, assessmentOf, moneyOf, type SectionProps } from './sectionUi';

export function LedgersSection(props: SectionProps) {
  const { computation, whole, exact, currency, expanded, onToggle } = props;
  const t = useT();
  const { colors } = useTheme();
  const a = assessmentOf(computation);
  if (!a) return null;
  const fmt = moneyOf(exact, currency);
  void whole;
  return (
    <CollapsibleSection title={t('decide.section.ledgersTitle')} summary={t('decide.section.ledgersSummary')} expanded={expanded} onToggle={onToggle}>
      <Note>{t('decide.section.ledgersNote')}</Note>
      {a.ledgers.map((l) => {
        const dot = l.direction === 'better' ? colors.accent : l.direction === 'worse' ? colors.danger : colors.inkFaint;
        const direction = t(`decide.section.direction.${l.direction}`);
        return (
          <TableRow
            key={l.code}
            leading={<Dot color={dot} />}
            label={t(LEDGER_LABEL[l.code])}
            sub={`${t(LEDGER_DESC[l.code])} · ${direction}`}
            value={`${fmt(l.now)} → ${fmt(l.after)}`}
            a11yLabel={`${t(LEDGER_LABEL[l.code])}, ${fmt(l.now)} to ${fmt(l.after)}, ${direction}`}
          />
        );
      })}
    </CollapsibleSection>
  );
}
