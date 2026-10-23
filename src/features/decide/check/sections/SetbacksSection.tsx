/**
 * 05-16 section 6, "If something goes wrong": the four default setbacks (and any the user adds), each switchable, with its
 * hit and the cash left after it, the runway in months and the combined outcome tile. Figures come from
 * computation.setbacks (recomputed by the shell on every update). Setbacks go through canUse('setbacks'), which is always
 * true in Phase 5, so there is no lock chrome here.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { SetbackCode } from '@/engine/decide';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { CloseGlyph } from '@/ui/CloseGlyph';
import { hapticSelection } from '@/ui/haptics';
import { Text } from '@/ui/Text';
import { CASH_OUTCOME, SETBACK_LABEL } from '../../copy/codeMaps';
import { runwayCopy } from '../../copy/depthInputsCopy';
import { refText, type Translate } from '../refText';
import { canUse } from '../../entitlements';
import type { SetbackLine } from '../../snapshot/types';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import { LineEditorSheet, type LineEditorValue } from '../LineEditorSheet';
import { Dot, Note, Tile, moneyOf, type SectionBodyProps, type SectionProps } from './sectionUi';

const MAX_SETBACKS = 12;
const DEFAULT_ASSUMED = { months: 3, percentDrop: 20, daysLate: 30 };

function freshId(lines: readonly { id: string }[]): string {
  const taken = new Set(lines.map((l) => l.id));
  let n = lines.length + 1;
  while (taken.has(`sb-${n}`)) n += 1;
  return `sb-${n}`;
}

export type SetbacksBodyProps = SectionBodyProps & { resultIds?: readonly string[] };

/** The closed-fold line: the runway after the purchase, or the open wording when nothing limits it. */
function setbacksSummary(computation: SectionProps['computation'], t: ReturnType<typeof useT>): string | null {
  const report = computation.setbacks;
  if (report === null) return null;
  const runway = computation.incomeAtRisk ? runwayCopy(computation.incomeAtRisk) : null;
  if (report.runwayMonths === null) return t('decide.section.setbacksSummaryOpen');
  return runway?.summary ? refText(t as Translate, runway.summary) : t('decide.section.setbacksSummary', { count: report.runwayMonths });
}

export function SetbacksBody(props: SetbacksBodyProps) {
  const { computation, inputs, update, whole, currency, readOnly } = props;
  // WR-C07: the report is built from the settled inputs; its results are matched to the live lines by id, so a removal
  // never pairs a result with the wrong line before the figures settle.
  const resultIndex = new Map((props.resultIds ?? inputs.setbacks.map((s) => s.id)).map((id, i) => [id, i] as const));
  const t = useT();
  const { colors, pairing } = useTheme();
  const [editing, setEditing] = useState(false);
  const latest = useRef(inputs);
  useEffect(() => {
    latest.current = inputs; // read by the local undo, which runs after later edits
  }, [inputs]);

  if (!canUse('setbacks')) return null;
  const report = computation.setbacks;
  if (report === null) return null;
  const fmt = moneyOf(whole, currency);
  const lines = inputs.setbacks;

  const describe = (l: SetbackLine): string => {
    switch (l.code) {
      case 'unexpected_expense':
        return l.amount !== null && l.amount > 0
          ? t('decide.section.setbackDesc.unexpectedAmount', { amount: fmt(l.amount) })
          : t('decide.section.setbackDesc.unexpected_expense');
      case 'income_drop':
        return t('decide.section.setbackDesc.income_drop', { pct: l.percentDrop, count: l.months });
      case 'job_loss':
        return t('decide.section.setbackDesc.job_loss', { count: l.months });
      case 'late_invoice':
        return t('decide.section.setbackDesc.late_invoice', { count: l.daysLate });
    }
  };

  const toggle = (id: string) => update({ setbacks: lines.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)) });

  const remove = (line: SetbackLine, name: string) => {
    if (readOnly) return; // WR-C06: a decided check removes nothing and says nothing
    const index = lines.findIndex((l) => l.id === line.id);
    update({ setbacks: lines.filter((l) => l.id !== line.id) });
    showToast({
      kind: 'destructive',
      text: { key: 'decide.toast.lineRemoved', params: { name } },
      onUndo: () => {
        const now = latest.current.setbacks;
        if (now.some((l) => l.id === line.id)) return;
        const next = [...now];
        next.splice(Math.min(Math.max(index, 0), next.length), 0, line);
        update({ setbacks: next });
      },
    });
  };

  const save = (v: LineEditorValue) => {
    setEditing(false);
    const code: SetbackCode = v.code;
    const line: SetbackLine = {
      id: freshId(lines),
      code,
      enabled: true,
      amount: code === 'unexpected_expense' && v.amount > 0 ? v.amount : null,
      percentDrop: code === 'income_drop' ? (v.percentDrop > 0 ? v.percentDrop : DEFAULT_ASSUMED.percentDrop) : 0,
      months: code === 'income_drop' || code === 'job_loss' ? (v.months > 0 ? v.months : DEFAULT_ASSUMED.months) : 0,
      daysLate: code === 'late_invoice' ? (v.daysLate > 0 ? v.daysLate : DEFAULT_ASSUMED.daysLate) : 0,
    };
    update({ setbacks: [...lines, line] });
  };

  // D-32: the runway lost to the purchase and, per setback, whether the new payments are still met.
  const tr = t as Translate;
  const runway = computation.incomeAtRisk ? runwayCopy(computation.incomeAtRisk) : null;

  return (
    <View>
      <Note>{t('decide.section.setbacksNote')}</Note>
      {runway?.lostLine ? <Note>{refText(tr, runway.lostLine)}</Note> : null}
      {lines.map((l) => {
        const i = resultIndex.get(l.id);
        const r = i === undefined ? undefined : report.results[i];
        if (!r || i === undefined) return null;
        const name = t(SETBACK_LABEL[l.code]);
        const after = r.outcome === 'wiped_out' ? t('decide.section.setbackWiped') : t('decide.section.setbackAfter', { amount: fmt(r.cashAfter) });
        const hit = t('decide.section.setbackHit', { amount: fmt(r.hit) });
        const met = runway?.perSetback[i];
        const metText = met ? refText(tr, met.line) : null;
        const metOk = computation.incomeAtRisk?.setbacks[i]?.paymentsMet ?? true;
        return (
          <View key={l.id} style={[styles.row, { borderTopColor: colors.line2 }]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: l.enabled, disabled: readOnly }}
              accessibilityLabel={[`${name}, ${describe(l)}, ${hit}, ${after}`, metText].filter(Boolean).join(', ')}
              disabled={readOnly}
              onPress={() => {
                hapticSelection();
                toggle(l.id);
              }}
              style={({ pressed }) => [styles.main, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
            >
              <View style={[styles.box, { borderColor: l.enabled ? colors.ink : colors.line4, backgroundColor: l.enabled ? colors.ink : 'transparent' }]} />
              <View style={styles.text}>
                <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink }}>{name}</Text>
                <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{describe(l)}</Text>
                {metText ? (
                  <View style={styles.tag}>
                    <Dot color={metOk ? colors.accent : colors.danger} />
                    <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: metOk ? colors.inkMuted : colors.danger }}>{metText}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.figures}>
                <Text scale="capped" style={{ ...textRole(pairing, 'label'), color: colors.ink, textAlign: 'right' }}>
                  {hit}
                </Text>
                <Text
                  scale="capped"
                  style={{
                    ...textRole(pairing, 'label'),
                    fontSize: fontSize.meta,
                    color: r.outcome === 'wiped_out' ? colors.danger : colors.inkMuted,
                    textAlign: 'right',
                  }}
                >
                  {after}
                </Text>
              </View>
            </Pressable>
            {!readOnly ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('decide.lineEditor.removeA11y', { name })}
                onPress={() => remove(l, name)}
                style={styles.remove}
              >
                <CloseGlyph color={colors.inkDim} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {!readOnly && lines.length < MAX_SETBACKS ? (
        <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={styles.add}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.section.setbackAdd')}</Text>
        </Pressable>
      ) : null}
      {report.anyEnabled ? (
        <Tile>
          {t(CASH_OUTCOME[report.stressedOutcome])} {fmt(report.stressedCash)}
        </Tile>
      ) : null}
      <LineEditorSheet visible={editing} context="setback" currency={currency} formatMoney={fmt} onSave={save} onCancel={() => setEditing(false)} />
    </View>
  );
}

export function SetbacksSection(props: SectionProps & { resultIds?: readonly string[] }) {
  const { computation, expanded, onToggle } = props;
  const t = useT();
  const summary = canUse('setbacks') ? setbacksSummary(computation, t) : null;
  if (summary === null) return null;
  return (
    <CollapsibleSection title={t('decide.section.setbacksTitle')} summary={summary} expanded={expanded} onToggle={onToggle}>
      <SetbacksBody {...props} />
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  main: { flex: 1, minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd, paddingVertical: space.gapSm },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5 },
  text: { flex: 1, flexShrink: 1 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  figures: { alignItems: 'flex-end', flexShrink: 1 },
  remove: { width: space.touchMin, height: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  add: { minHeight: space.touchMin, justifyContent: 'center' },
});
