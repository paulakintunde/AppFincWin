// 05-127 (D-101, R18.2): the Pots screen, a pushed DetailScreen. Named sinking funds, counted: what each needs a month
// comes off net free cash flow. States: loading skeleton, list error with Try again, empty with one primary action, and the
// populated list with a closed Done fold. Every action is one undo step with a toast. Declarative copy only (DCU-09).
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useDeletePot, useSetPotDone } from '@/data/mutations/decidePots';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { currencyCode, minorUnits } from '@/engine/money';
import { useT } from '@/i18n';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { DecisionDetailSheet } from '../past/DecisionDetailSheet';
import { usePastDecisions } from '../past/usePastDecisions';
import { FoldRow } from '../ui/FoldRow';
import { useInfoSheet } from '../ui/useInfoSheet';
import { PotRow } from './PotRow';
import { PotSheet } from './PotSheet';
import type { PotRowModel } from './potsModel';
import { usePotsRead } from './usePots';

type T = (key: string, params?: Record<string, string | number>) => string;

const SKELETON_BARS = 3;

export function PotsScreen() {
  const t = useT() as T;
  const { colors, pairing } = useTheme();
  const fmt = useMoneyFormatter(false);
  const read = usePotsRead();
  const past = usePastDecisions();
  const info = useInfoSheet('pots');
  const { remove } = useDeletePot();
  const { setDone } = useSetPotDone();
  // undefined: closed; null: add mode; a row: edit mode.
  const [editing, setEditing] = useState<SavingsGoalRow | null | undefined>(undefined);
  const [openCheckId, setOpenCheckId] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);

  const { status, model } = read;
  const home = past.ctx.home;
  const empty = status === 'ready' && model.live.length === 0;
  const loaded = status === 'ready';

  const toast = (key: string, name: string, stepId: string) =>
    showToast({ kind: 'destructive', text: { key, params: { name } }, stepId });

  const onDelete = (row: SavingsGoalRow) => toast('decide.pots.toast.deleted', row.name, remove(row));
  const onToggleDone = (row: SavingsGoalRow) => {
    const done = row.done_at === null;
    toast(done ? 'decide.pots.toast.done' : 'decide.pots.toast.reopened', row.name, setDone(row, done));
  };
  const onOpen = (p: PotRowModel) => {
    if (p.kind === 'wait') {
      if (p.row.check_id !== null) setOpenCheckId(p.row.check_id);
    } else setEditing(p.row);
  };

  const renderRow = (p: PotRowModel, i: number, dimmed: boolean) => (
    <View key={p.row.id} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line4 } : null}>
      <PotRow
        pot={p}
        dimmed={dimmed}
        home={home}
        formatDate={past.formatDate}
        onOpen={() => onOpen(p)}
        onToggleDone={() => onToggleDone(p.row)}
        onDelete={p.kind === 'pot' ? () => onDelete(p.row) : undefined}
      />
    </View>
  );

  const selected = past.decisions.find((d) => d.id === openCheckId) ?? null;
  const link = { ...textRole(pairing, 'label'), color: colors.accent };
  const meta = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };

  return (
    <DetailScreen title={t('decide.pots.title')}>
      <View style={styles.heading}>
        <View style={styles.headingLeft}>
          <Text testID="pots-heading" accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, flexShrink: 0 }}>
            {t('decide.pots.title')}
          </Text>
          {info.button()}
        </View>
        {loaded && !empty ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('decide.pots.addA11y')}
            accessibilityState={{ disabled: model.addDisabled }}
            disabled={model.addDisabled}
            onPress={() => setEditing(null)}
            style={[styles.link, model.addDisabled ? { opacity: 0.5 } : null]}
          >
            <Text style={link}>{t('decide.pots.add')}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={meta}>{t('decide.pots.sub')}</Text>
      {loaded && model.addDisabled ? <Text style={meta}>{t('decide.pots.limit')}</Text> : null}
      {loaded && !empty ? (
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
          {t('decide.pots.summary', {
            amount: fmt.formatMoney({ amount: minorUnits(model.summary.total), currency: currencyCode(home) }),
            count: model.summary.count,
          })}
        </Text>
      ) : null}

      {status === 'loading' ? (
        <View accessible accessibilityLabel={t('decide.pots.loading')} accessibilityState={{ busy: true }} style={styles.skeleton}>
          {Array.from({ length: SKELETON_BARS }, (_, i) => (
            <View key={i} style={[styles.bar, { backgroundColor: colors.fill1 }]} />
          ))}
        </View>
      ) : null}

      {status === 'error' ? (
        <View style={styles.error}>
          <Text style={meta}>{t('decide.pots.loadError')}</Text>
          <Pill label={t('decide.flow.retry')} variant="secondary" onPress={read.refetch} />
        </View>
      ) : null}

      {empty ? (
        <View style={styles.error}>
          <Text style={meta}>{t('decide.pots.empty')}</Text>
          <Pill label={t('decide.pots.emptyAction')} variant="primary" onPress={() => setEditing(null)} />
        </View>
      ) : null}

      {loaded && !empty ? (
        <View style={[styles.list, { backgroundColor: colors.surface }, shadows.card]}>
          {model.live.map((p, i) => renderRow(p, i, false))}
        </View>
      ) : null}

      {loaded && model.done.length > 0 ? (
        <FoldRow
          title={t('decide.pots.doneFold', { count: model.done.length })}
          preview=""
          expanded={doneOpen}
          onToggle={() => setDoneOpen((o) => !o)}
        >
          <View style={[styles.list, { backgroundColor: colors.surface }, shadows.card]}>
            {model.done.map((p, i) => renderRow(p, i, true))}
          </View>
        </FoldRow>
      ) : null}

      {info.sheet}
      <PotSheet visible={editing !== undefined} pot={editing ?? null} onClose={() => setEditing(undefined)} />
      <DecisionDetailSheet
        decision={selected}
        links={selected !== null ? (past.linksByCheck.get(selected.id) ?? []) : []}
        linkedLines={selected !== null ? (past.linesByCheck.get(selected.id) ?? []) : []}
        onClose={() => setOpenCheckId(null)}
      />
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: space.gapSm },
  headingLeft: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
  list: { borderRadius: radii.card, overflow: 'hidden' },
  skeleton: { gap: space.gapMd, paddingVertical: space.gapMd },
  bar: { height: 16, borderRadius: radii.pill },
  error: { gap: space.gapMd, alignItems: 'flex-start', paddingVertical: space.gapSm },
});
