/**
 * 05-15 section 4, "Against your lines": six rows from assessment.checks, each with its word (Clear / Short / Over /
 * Squeezed) beside the dot and a description that names the user's own line. Collapsed by default; renders nothing
 * without a resolved logged verdict.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import type { InfoKey } from '../../copy/infoTerms';
import { useInfoSheet, type InfoSheetHandle } from '../../ui/useInfoSheet';
import { InfoTitle } from '../InfoTitle';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import { percentText } from '../../copy/percentText';
import { cushionCopy, marginText } from '../../copy/depthVerdictCopy';
import type { LineMargin, MarginLine } from '@/engine/decide';
import { refText, type Translate } from '../refText';
import { Dot, assessmentOf, moneyOf, type SectionProps } from './sectionUi';

/** D-70 / R3 "Where": each Every-line row's ⓘ (the month row has none). */
const LINE_INFO: Record<string, InfoKey | undefined> = {
  cash: 'reserve',
  dsr: 'dsrLine',
  owe: 'unsecuredMultiple',
  inv: 'investingFloor',
  save: 'savingFloor',
};

interface LineRow {
  key: string;
  label: string;
  ok: boolean;
  fail: string;
  desc: string;
}

/** 05-64: the six rows without the section chrome; "What breaks" shows them as "Every line". */
export function EveryLineRows(props: Omit<SectionProps, 'expanded' | 'onToggle'>) {
  const { computation, whole, currency } = props;
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
      // IN-C03 (D-65): a zero investing floor means none is set, not "a floor of 0"
      desc:
        limits.investingFloor === 0
          ? t('decide.section.lineInvestingNoFloor', { after: fmt(a.investingAfter) })
          : t('decide.section.lineInvestingDesc', { after: fmt(a.investingAfter), floor: fmt(limits.investingFloor) }),
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
  return (
    <View>
      {rows.map((r) => {
        const word = r.ok ? t('decide.section.lineClear') : r.fail;
        const m = marginFor(r.key);
        const extra = m ? refText(tr, marginText(m, fmt, { fact: tightFact, stackedApplied, formatDate })) : undefined;
        const rowProps: LineViewProps = {
          dot: r.ok ? colors.accent : colors.danger,
          label: r.label,
          sub: r.desc,
          value: word,
          extra,
          danger: !r.ok,
          a11yLabel: [`${r.label}, ${word}. ${r.desc}`, extra].filter(Boolean).join('. '),
        };
        const infoKey = LINE_INFO[r.key];
        return infoKey ? <InfoLineRow key={r.key} infoKey={infoKey} {...rowProps} /> : <LineView key={r.key} {...rowProps} />;
      })}
    </View>
  );
}

/** The former "Against your lines" section; deleted in 05-78 once step 3 composes the folds (05-74). */
export function LinesSection(props: SectionProps) {
  const t = useT();
  const a = assessmentOf(props.computation);
  if (!a) return null;
  const { expanded, onToggle, ...rest } = props;
  const c = a.checks;
  const clear = [c.cash, c.month, c.dsr, c.owe, c.inv, c.save].filter(Boolean).length;
  return (
    <CollapsibleSection
      title={t('decide.section.linesTitle')}
      summary={t('decide.section.linesSummary', { clear, over: 6 - clear })}
      expanded={expanded}
      onToggle={onToggle}
    >
      <EveryLineRows {...rest} />
    </CollapsibleSection>
  );
}

interface LineViewProps {
  dot: string;
  label: string;
  sub: string;
  value: string;
  extra?: string;
  danger: boolean;
  a11yLabel: string;
}

function InfoLineRow({ infoKey, ...rest }: LineViewProps & { infoKey: InfoKey }) {
  const info = useInfoSheet(infoKey);
  return <LineView {...rest} info={info} />;
}

/** The TableRow layout with the label in an InfoTitle when the row has an ⓘ. */
function LineView({ dot, label, sub, value, extra, danger, a11yLabel, info }: LineViewProps & { info?: InfoSheetHandle }) {
  const { colors, pairing } = useTheme();
  const labelRole = { ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink };
  const labelText = <Text style={labelRole}>{label}</Text>;
  return (
    <View
      accessible
      accessibilityLabel={a11yLabel}
      accessibilityActions={info ? [info.aboutAction] : undefined}
      onAccessibilityAction={info?.onAccessibilityAction}
      style={[styles.row, { borderTopColor: colors.line2 }]}
    >
      <Dot color={dot} />
      <View style={styles.text}>
        {info ? (
          <InfoTitle info={info} lineHeight={labelRole.lineHeight}>
            {labelText}
          </InfoTitle>
        ) : (
          labelText
        )}
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{sub}</Text>
        {extra ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>{extra}</Text> : null}
      </View>
      <Text scale="capped" style={{ ...textRole(pairing, 'label'), color: danger ? colors.danger : colors.ink, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    minHeight: space.touchMin,
    paddingVertical: space.gapSm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, flexShrink: 1 },
});
