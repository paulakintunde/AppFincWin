/**
 * 05-15 section 4, "Against your lines": six rows from assessment.checks, each with its word (Clear / Short / Over /
 * Squeezed) beside the dot and a description that names the user's own line. Collapsed by default; renders nothing
 * without a resolved logged verdict.
 */
import React from 'react';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import { percentText } from '../../copy/percentText';
import { cushionCopy, marginText } from '../../copy/depthVerdictCopy';
import type { LineMargin, MarginLine } from '@/engine/decide';
import { refText, type Translate } from '../refText';
import { Dot, TableRow, assessmentOf, moneyOf, type SectionProps } from './sectionUi';

interface LineRow {
  key: string;
  label: string;
  ok: boolean;
  fail: string;
  desc: string;
}

export function LinesSection(props: SectionProps) {
  const { computation, whole, currency, expanded, onToggle } = props;
  const t = useT();
  const tr = t as Translate;
  const { colors } = useTheme();
  const a = assessmentOf(computation);
  if (!a) return null;
  const fmt = moneyOf(whole, currency);
  const limits = a.context.limits;
  const cashWarning = a.warnings.find((w) => w.code === 'cash');
  const monthWarning = a.warnings.find((w) => w.code === 'month');
  const cashShort = cashWarning ? cashWarning.shortfall : Math.max(0, limits.reserve - a.cashAfter);
  const monthShort = monthWarning ? monthWarning.shortfall : Math.max(0, -a.left);
  const dsrDesc =
    a.debtServiceRatioAfter === null
      ? t('decide.section.lineDsrDescNoIncome', { line: percentText(limits.dsrLine) })
      : t('decide.section.lineDsrDesc', { pct: percentText(a.debtServiceRatioAfter), line: percentText(limits.dsrLine) });
  const rows: LineRow[] = [
    {
      key: 'cash',
      label: t('decide.section.lineCash'),
      ok: a.checks.cash,
      fail: t('decide.section.lineShort', { amount: fmt(cashShort) }),
      desc: t('decide.depth.cushion.row', {
        cushion: fmt(limits.reserve),
        cashAfter: fmt(a.cashAfter),
        reason: refText(tr, cushionCopy(a.context)),
      }),
    },
    {
      key: 'month',
      label: t('decide.section.lineMonth'),
      ok: a.checks.month,
      fail: t('decide.section.lineShort', { amount: fmt(monthShort) }),
      desc: t('decide.section.lineMonthDesc', { left: fmt(a.left) }),
    },
    { key: 'dsr', label: t('decide.section.lineDsr'), ok: a.checks.dsr, fail: t('decide.section.lineOver'), desc: dsrDesc },
    {
      key: 'owe',
      label: t('decide.section.lineOwe'),
      ok: a.checks.owe,
      fail: t('decide.section.lineOver'),
      desc: t('decide.section.lineOweDesc', { amount: fmt(a.unsecuredAfter), line: fmt(limits.unsecuredLine) }),
    },
    {
      key: 'inv',
      label: t('decide.section.lineInvesting'),
      ok: a.checks.inv,
      fail: t('decide.section.lineSqueezed'),
      desc: t('decide.section.lineInvestingDesc', { after: fmt(a.investingAfter), floor: fmt(limits.investingFloor) }),
    },
    {
      key: 'save',
      label: t('decide.section.lineSaving'),
      ok: a.checks.save,
      fail: t('decide.section.lineSqueezed'),
      desc: t('decide.section.lineSavingDesc', { after: fmt(a.savingAfter), floor: fmt(limits.savingFloor) }),
    },
  ];
  // D-25: each line's margin, shown under a flagged or missed line; the cash row also carries the cash-before-payday margin.
  const margins = computation.decision?.margins ?? [];
  const stackedApplied = computation.decision ? computation.decision.stacked.filter((s) => s.status === 'applied').length : 0;
  const tightFact = a.cashPath.status === 'available' ? a.cashPath.tightBeforePayday : null;
  const formatDate = (d: string) => whole.formatDate(d);
  const shown = (m: LineMargin | undefined): LineMargin | undefined => (m && (m.flag === 'on_edge' || m.margin < 0) ? m : undefined);
  const marginFor = (key: string): LineMargin | undefined => {
    const find = (line: MarginLine) => margins.find((m) => m.line === line);
    if (key === 'cash') return shown(find('cash')) ?? shown(find('cash_path'));
    return key === 'save' ? undefined : shown(find(key as MarginLine));
  };
  const clear = rows.filter((r) => r.ok).length;
  return (
    <CollapsibleSection
      title={t('decide.section.linesTitle')}
      summary={t('decide.section.linesSummary', { clear, over: rows.length - clear })}
      expanded={expanded}
      onToggle={onToggle}
    >
      {rows.map((r) => {
        const word = r.ok ? t('decide.section.lineClear') : r.fail;
        const m = marginFor(r.key);
        const extra = m ? refText(tr, marginText(m, fmt, { fact: tightFact, stackedApplied, formatDate })) : undefined;
        return (
          <TableRow
            key={r.key}
            leading={<Dot color={r.ok ? colors.accent : colors.danger} />}
            label={r.label}
            sub={r.desc}
            value={word}
            extra={extra}
            tone={r.ok ? 'ink' : 'danger'}
            a11yLabel={[`${r.label}, ${word}. ${r.desc}`, extra].filter(Boolean).join('. ')}
          />
        );
      })}
    </CollapsibleSection>
  );
}
