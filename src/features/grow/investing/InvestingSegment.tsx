// 06-15 (G01) + 06-18 (G08, GRW-04, GRW-06, GRW-10): the Investing segment. Hero with the gain as a record, the investing-line
// card, one row per holding (value, as-of date, gain or loss), a quiet stale-value row, the allocation bar and the no-live-prices
// note. Values are ones the user typed; each shows its as-of date. Declarative copy only.
//
// The segment opens its own AddHoldingSheet for its buttons; GrowHome opens another for the FAB.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { useDecideSettings } from '@/data/queries/decide';
import type { HoldingType } from '@/db/holdings';
import { useT } from '@/i18n';
import { GrowGlyph } from '@/features/grow/ui/GrowGlyph';
import { StackedBar } from '@/features/grow/ui/StackedBar';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import type { CategorySwatchKey } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { AddHoldingSheet } from './AddHoldingSheet';
import { useInvestingFormat } from './investingFormat';
import { useInvestingRead, type HoldingLine } from './useInvestingRead';

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
  const { model } = read;

  const sheet = <AddHoldingSheet visible={adding} onClose={() => setAdding(false)} />;

  if (read.status === 'ready' && model.holdings.length === 0) {
    return (
      <>
        <View testID="grow-investing-empty" style={[styles.card, styles.center, { backgroundColor: colors.surface, borderColor: colors.line1 }]}>
          <GrowGlyph name="invest" color={colors.accent} size={28} />
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.investing.emptyTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.investing.emptyBody')}</Text>
          <Pill label={t('grow.investing.emptyAction')} variant="primary" onPress={() => setAdding(true)} />
        </View>
        {sheet}
      </>
    );
  }
  if (read.status !== 'ready') return null;

  const label = textRole(pairing, 'label');
  const body = textRole(pairing, 'body');
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
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }]}>
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

      <View style={[styles.card, styles.between, { backgroundColor: colors.surface, borderColor: colors.line1 }]}>
        <Text style={{ ...body, color: colors.ink, flex: 1 }}>
          {floor !== null && floor > 0
            ? t('grow.investing.lineCard', { amount: f.money(model.monthlyIn), rule: f.money(floor) })
            : t('grow.investing.lineCardNoRule', { amount: f.money(model.monthlyIn) })}
        </Text>
        {floor !== null && floor > 0 && model.monthlyIn >= floor ? <StateBadge tone="accent" shape="sCheck" label={t('grow.investing.met')} /> : null}
      </View>

      <Text accessibilityRole="header" style={{ ...label, color: colors.inkMuted }}>{t('grow.investing.section')}</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line1, padding: 0 }]}>
        {model.holdings.map((h, i) => {
          const sub =
            h.monthlyAmount !== null && h.monthlyAmount > 0
              ? t('grow.investing.row', { type: t(`grow.investing.types.${h.type}`), monthly: f.money(h.monthlyAmount, h.currency), date: f.day(h.asOf) })
              : t('grow.investing.rowNoMonthly', { type: t(`grow.investing.types.${h.type}`), date: f.day(h.asOf) });
          return (
            <Pressable
              key={h.id}
              testID={`holding-row-${h.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${h.name}, ${f.money(h.value, h.currency)}, ${sub}`}
              onPress={() => pushOnce(`/grow/holding/${h.id}` as Href)}
              style={[styles.holdingRow, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line1 } : null]}
            >
              <View style={styles.grow}>
                <Text style={{ ...body, color: colors.ink }}>{h.name}</Text>
                <Text style={{ ...label, color: colors.inkMuted }}>{sub}</Text>
              </View>
              <View style={styles.end}>
                <Text style={{ ...body, color: colors.ink }}>{f.money(h.value, h.currency)}</Text>
                <GainBadge line={h} />
              </View>
            </Pressable>
          );
        })}
      </View>

      {stale.length > 0 ? (
        <Pressable
          testID="investing-stale-row"
          accessibilityRole="button"
          accessibilityLabel={`${t('grow.investing.staleRow')} ${t('grow.investing.staleSub', { date: f.day(stale[0]!.asOf) })}`}
          onPress={() => pushOnce(`/grow/holding/${stale[0]!.id}` as Href)}
          style={[styles.card, styles.between, { backgroundColor: colors.surface, borderColor: colors.line1 }]}
        >
          <Text style={{ ...body, color: colors.ink }}>{t('grow.investing.staleRow')}</Text>
          <Text style={{ ...label, color: colors.inkMuted }}>{t('grow.investing.staleSub', { date: f.day(stale[0]!.asOf) })}</Text>
        </Pressable>
      ) : null}

      {groups.length > 0 ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }]}>
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
      <Pressable testID="investing-add-row" accessibilityRole="button" onPress={() => setAdding(true)} style={styles.addRow}>
        <Text style={{ ...body, color: colors.accent }}>{t('grow.investing.addHolding')}</Text>
      </Pressable>
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.gapSm },
  card: { gap: space.gapSm, borderWidth: 1, borderRadius: radii.card, padding: space.cardPadLg },
  center: { alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapSm },
  holdingRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, padding: space.cardPad, minHeight: space.touchMin },
  grow: { flex: 1 },
  end: { alignItems: 'flex-end', gap: 2 },
  addRow: { minHeight: space.touchMin, justifyContent: 'center' },
});
