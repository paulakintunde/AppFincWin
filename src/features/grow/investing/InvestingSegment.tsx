// 06-15 (G01) + 06-18 (G08, GRW-04, GRW-06, GRW-10): the Investing segment. Hero with the gain as a record, the investing-line
// card, one row per holding (value, as-of date, gain or loss), a quiet stale-value row, the allocation bar and the no-live-prices
// note. Values are ones the user typed; each shows its as-of date. Declarative copy only.
//
// The segment opens its own AddHoldingSheet for its buttons; GrowHome opens another for the FAB.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { useEditHolding } from '@/data/mutations/growHoldings';
import { useDecideSettings } from '@/data/queries/decide';
import { useHoldingLotRows, useHoldingRows } from '@/data/queries/growHoldings';
import { DeletableRow } from '@/ui/DeletableRow';
import { AccTile } from '@/features/grow/ui/AccTile';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import type { HoldingRow, HoldingType } from '@/db/holdings';
import { useT } from '@/i18n';
import { GrowGlyph } from '@/features/grow/ui/GrowGlyph';
import { StackedBar } from '@/features/grow/ui/StackedBar';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows, type CategorySwatchKey } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { AddHoldingSheet } from './AddHoldingSheet';
import { UpdateValueSheet } from './UpdateValueSheet';
import { useInvestingFormat } from './investingFormat';
import { useInvestingRead, type HoldingLine } from './useInvestingRead';

const TILE_GLYPH = { pension: 'pension', retirement: 'pension', brokerage: 'invest', crypto: 'invest', other: 'invest' } as const;

const SWATCHES: readonly CategorySwatchKey[] = ['green', 'blue', 'ochre', 'plum', 'teal', 'rust', 'slate'];

/** Gain or loss as a quiet badge: sUp or sDown, ink-toned, with a word for assistive tech. Never red. */
export function GainBadge({ line }: { line: HoldingLine }) {
  const t = useT();
  const f = useInvestingFormat();
  const up = line.gain >= 0;
  const amount = f.money(Math.abs(line.gain), line.currency);
  return (
    <StateBadge
      tone="slate"
      shape={up ? 'sUp' : 'sDown'}
      label={f.signed(line.gain, line.currency)}
      accessibilityLabel={t(up ? 'grow.investing.gainA11y' : 'grow.investing.lossA11y', { amount })}
    />
  );
}

export function InvestingSegment() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const f = useInvestingFormat();
  const read = useInvestingRead();
  const settings = useDecideSettings(read.userId ?? undefined).data ?? null;
  const [adding, setAdding] = useState(false);
  const [updating, setUpdating] = useState<HoldingRow | null>(null);
  const [editing, setEditing] = useState<HoldingRow | null>(null);
  const holdingRows = useHoldingRows(read.userId ?? undefined, read.householdId ?? undefined).data;
  const lotRows = useHoldingLotRows(read.userId ?? undefined, read.householdId ?? undefined).data;
  const { remove } = useEditHolding();
  const { model } = read;
  const rowOf = (id: string): HoldingRow | null => holdingRows?.find((h) => h.id === id && h.deleted_at === null) ?? null;
  const removeHolding = (id: string, name: string) => {
    const row = rowOf(id);
    if (row === null || read.userId === null) return;
    // P3-IN-03: an already-removed row is refused; say so instead of throwing out of the press handler.
    try {
      const stepId = remove(row, read.userId);
      showToast({ kind: 'destructive', text: undoLabelText('holdingRemoved', { name }), stepId });
    } catch {
      showToast({ kind: 'refusal', text: { key: 'grow.common.saveFailed' } });
    }
  };

  const sheet = (
    <>
      <AddHoldingSheet visible={adding} onClose={() => setAdding(false)} />
      <AddHoldingSheet
        visible={editing !== null}
        holding={editing}
        lots={editing === null ? undefined : (lotRows ?? []).filter((l) => l.holding_id === editing.id && l.deleted_at === null)}
        onClose={() => setEditing(null)}
      />
      {updating !== null ? <UpdateValueSheet visible holding={updating} onClose={() => setUpdating(null)} /> : null}
    </>
  );

  if (read.status === 'ready' && model.holdings.length === 0) {
    return (
      <>
        <View testID="grow-investing-empty" style={[styles.card, styles.center, { backgroundColor: colors.surface, ...shadows.card }]}>
          <GrowGlyph name="invest" color={colors.accent} size={28} />
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.investing.emptyTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.investing.emptyBody')}</Text>
          <Pill label={t('grow.investing.emptyAction')} variant="primary" onPress={() => setAdding(true)} />
        </View>
        {sheet}
      </>
    );
  }
  if (read.status === 'loading') {
    return (
      <View testID="grow-investing-loading" accessibilityLabel={t('grow.home.loading')} style={styles.stack}>
        <View style={[styles.block, { height: 96, backgroundColor: colors.fill1 }]} />
        <View style={[styles.block, { height: 112, backgroundColor: colors.fill1 }]} />
        <View style={[styles.block, { height: 128, backgroundColor: colors.fill1 }]} />
      </View>
    );
  }
  if (read.status === 'error') {
    // P3-WR-10: nothing cached and the read failed; say so and offer Try again (as the Debts segment does).
    return (
      <View testID="grow-investing-error" style={[styles.card, styles.center, { backgroundColor: colors.surface, ...shadows.card }]}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.common.loadErrorTitle')}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.common.loadErrorBody')}</Text>
        <Pill label={t('grow.common.tryAgain')} variant="secondary" onPress={read.refetch} />
      </View>
    );
  }

  const label = textRole(pairing, 'label');
  const body = textRole(pairing, 'body');
  const strong = textRole(pairing, 'bodyStrong');
  const above = model.totals.gain >= 0;
  const oldest = model.holdings.reduce<string>((min, h) => (min === '' || h.asOf < min ? h.asOf : min), '');
  const stale = model.holdings.filter((h) => h.stale).sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
  const floor = settings?.investing_floor ?? null;
  const allocated = model.holdings.filter((h) => h.allocationPercent !== null && h.allocationPercent > 0);
  const byType = new Map<HoldingType, number>();
  for (const h of allocated) byType.set(h.type, (byType.get(h.type) ?? 0) + (h.allocationPercent ?? 0));
  const groups = [...byType.entries()];
  const legend = groups.map(([type, pct]) => `${t(`grow.investing.types.${type}`)} ${pct}%`).join(' · ');

  return (
    <View testID="grow-investing" style={styles.stack}>
      <View style={[styles.card, { backgroundColor: colors.surface, ...shadows.card }]}>
        <Text style={{ ...label, color: colors.inkMuted }}>{t('grow.investing.heroLabel')}</Text>
        <Text testID="investing-hero" style={{ ...textRole(pairing, 'display'), color: colors.ink }}>{f.money(model.totals.value)}</Text>
        <Text style={{ ...label, color: colors.inkMuted }}>
          {t('grow.investing.heroNote', {
            amount: f.money(Math.abs(model.totals.gain)),
            direction: t(above ? 'grow.investing.above' : 'grow.investing.below'),
            date: f.day(oldest),
          })}
        </Text>
      </View>

      <View style={[styles.card, styles.between, { backgroundColor: colors.surface, ...shadows.card }]}>
        <Text style={{ ...body, color: colors.ink, flex: 1 }}>
          {floor !== null && floor > 0
            ? t('grow.investing.lineCard', { amount: f.money(model.monthlyIn), rule: f.money(floor) })
            : t('grow.investing.lineCardNoRule', { amount: f.money(model.monthlyIn) })}
        </Text>
        {floor !== null && floor > 0 && model.monthlyIn >= floor ? <StateBadge tone="accent" shape="sCheck" label={t('grow.investing.met')} /> : null}
      </View>

      <Text accessibilityRole="header" style={{ ...label, color: colors.inkMuted }}>{t('grow.investing.section')}</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, ...shadows.card, padding: 0 }]}>
        {model.holdings.map((h, i) => {
          const sub =
            h.monthlyAmount !== null && h.monthlyAmount > 0
              ? t('grow.investing.row', { type: t(`grow.investing.types.${h.type}`), monthly: f.money(h.monthlyAmount, h.currency), date: f.day(h.asOf) })
              : t('grow.investing.rowNoMonthly', { type: t(`grow.investing.types.${h.type}`), date: f.day(h.asOf) });
          return (
            <View key={h.id} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line1 } : null}>
              <DeletableRow
                name={h.name}
                onOpen={() => pushOnce(`/grow/holding/${h.id}` as Href)}
                menu={[
                  { key: 'update', label: t('grow.investing.detail.updateValue'), onSelect: () => setUpdating(rowOf(h.id)) },
                  { key: 'edit', label: t('grow.investing.detail.edit'), onSelect: () => setEditing(rowOf(h.id)) },
                ]}
                confirm={{
                  title: t('grow.investing.detail.removeTitle', { name: h.name }),
                  body: t('grow.investing.detail.removeBody', { amount: f.money(h.value, h.currency) }),
                }}
                onDelete={() => removeHolding(h.id, h.name)}
                actionWord={t('grow.home.rowRemove')}
                accessibilityLabel={`${t('grow.investing.rowA11y', { name: h.name, value: f.money(h.value, h.currency), gain: f.signed(h.gain, h.currency) })}, ${sub}`}
              >
                <View testID={`holding-row-${h.id}`} style={styles.holdingRow}>
                  <AccTile glyph={TILE_GLYPH[h.type]} />
                  <View style={styles.grow}>
                    <Text style={{ ...strong, color: colors.ink }}>{h.name}</Text>
                    <Text style={{ ...label, color: colors.inkMuted }}>{sub}</Text>
                  </View>
                  <View style={styles.end}>
                    <Text style={{ ...strong, color: colors.ink }}>{f.money(h.value, h.currency)}</Text>
                    <GainBadge line={h} />
                  </View>
                </View>
              </DeletableRow>
            </View>
          );
        })}
        <Pressable
          testID="investing-add-row"
          accessibilityRole="button"
          accessibilityLabel={t('grow.investing.emptyAction')}
          onPress={() => setAdding(true)}
          style={[styles.addRow, styles.addInCard, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line1 }]}
        >
          <Text style={{ ...body, color: colors.accent }}>{t('grow.investing.addHolding')}</Text>
        </Pressable>
      </View>

      {stale.length > 0 ? (
        <Pressable
          testID="investing-stale-row"
          accessibilityRole="button"
          accessibilityLabel={`${t('grow.investing.staleRow')} ${t('grow.investing.staleSub', { date: f.day(stale[0]!.asOf) })}`}
          onPress={() => pushOnce(`/grow/holding/${stale[0]!.id}` as Href)}
          style={[styles.card, styles.between, { backgroundColor: colors.surface, ...shadows.card }]}
        >
          <Text style={{ ...body, color: colors.ink }}>{t('grow.investing.staleRow')}</Text>
          <Text style={{ ...label, color: colors.inkMuted }}>{t('grow.investing.staleSub', { date: f.day(stale[0]!.asOf) })}</Text>
        </Pressable>
      ) : null}

      {groups.length > 0 ? (
        <View style={[styles.card, { backgroundColor: colors.surface, ...shadows.card }]}>
          <Text style={{ ...label, color: colors.inkMuted }}>{t('grow.investing.allocationTitle')}</Text>
          <StackedBar
            segments={groups.map(([type, pct], i) => ({ key: type, value: pct, swatch: SWATCHES[i % SWATCHES.length]! }))}
            legend={legend}
            accessibilityLabel={`${t('grow.investing.allocationTitle')}: ${legend}`}
          />
        </View>
      ) : null}

      {model.totals.value > 0 ? (
        <Pressable
          testID="investing-see-growth"
          accessibilityRole="button"
          accessibilityLabel={t('grow.investing.detail.seeGrowth')}
          onPress={() =>
            pushOnce({
              pathname: '/grow/calculators/illustration',
              params: { start: String(model.totals.value), monthly: String(model.monthlyIn) },
            } as Href)
          }
          style={styles.addRow}
        >
          <Text style={{ ...body, color: colors.accent }}>{t('grow.investing.detail.seeGrowth')}</Text>
        </Pressable>
      ) : null}

      <Text style={{ ...label, color: colors.inkMuted }}>{t('grow.investing.noPrices')}</Text>
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.gapSm },
  card: { gap: space.gapSm, borderRadius: radii.card, padding: space.cardPadLg },
  center: { alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapSm },
  holdingRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, padding: space.cardPad, minHeight: space.touchMin },
  grow: { flex: 1 },
  end: { alignItems: 'flex-end', gap: 2 },
  block: { borderRadius: radii.card },
  addInCard: { paddingHorizontal: space.cardPad },
  addRow: { minHeight: space.touchMin, justifyContent: 'center' },
});
