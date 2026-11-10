// 06-15 (G01, D-07): the safety net card, always first. Blue swatch tile with a lock, the Locked badge (shape plus word),
// "saved of size", a blue bar, and the line that Decide never spends it. No size yet: the invitation to set one.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { useT } from '@/i18n';
import type { SafetyNetPoint } from '@/features/grow/connect';
import { GrowGlyph } from '@/features/grow/ui/GrowGlyph';
import { ProgressBar } from '@/features/grow/ui/ProgressBar';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { categorySwatch } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { goalPercent, type GoalRowMoney } from './GoalRow';

export const SAFETY_NET_HREF = '/grow/safety-net' as Href;

export interface SafetyNetCardProps {
  net: SafetyNetPoint | null;
  money: GoalRowMoney;
  animate?: boolean;
  /** Expected lines waiting for a confirm (D-32). */
  pending?: number;
  /** A month into the net, and the month it reaches its size at that rate (YYYY-MM-DD). Both set: the date line. */
  monthly?: number | null;
  reachesOn?: string | null;
}

export function SafetyNetCard({ net, money, animate = true, pending = 0, monthly = null, reachesOn = null }: SafetyNetCardProps) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const hasSize = net !== null && net.size !== null && net.size > 0;
  const saved = net === null ? 0 : net.saved;
  const percent = hasSize ? goalPercent(saved, net.size) : 0;
  const ofText = hasSize ? t('grow.safetyNet.figureOf', { target: money.amount(net.size!) }) : null;
  const plan = hasSize && monthly !== null && monthly > 0 && reachesOn !== null;
  const line = plan
    ? t('grow.safetyNet.cardLine', { monthly: money.amount(monthly), target: money.amount(net.size!), date: money.monthYear(reachesOn) })
    : hasSize
      ? t('grow.safetyNet.cardLineNoPlan')
      : t('grow.safetyNet.emptyBody');
  const spoken = `${t('grow.safetyNet.title')}, ${t('grow.safetyNet.lockedA11y')}, ${
    hasSize ? `${money.spoken(saved)} ${t('grow.safetyNet.figureOf', { target: money.spoken(net.size!) })}, ${percent}%` : money.spoken(saved)
  }. ${line}${pending > 0 ? `, ${t('grow.home.toConfirmA11y', { count: pending })}` : ''}`;
  return (
    <Pressable
      testID="grow-safety-net-card"
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={() => pushOnce(SAFETY_NET_HREF)}
      style={[styles.card, { backgroundColor: categorySwatch.blue.tint, borderColor: categorySwatch.blue.color }]}
    >
      <View style={styles.top}>
        <View style={[styles.tile, { backgroundColor: categorySwatch.blue.tint }]}>
          <GrowGlyph name="lock" color={categorySwatch.blue.color} size={30} />
        </View>
        <View style={styles.text}>
          <View style={styles.titleRow}>
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('grow.safetyNet.title')}</Text>
            <StateBadge tone="blue" shape="lock" label={t('grow.safetyNet.locked')} accessibilityLabel={t('grow.safetyNet.lockedA11y')} />
          </View>
          <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
            {money.amount(saved)}
            {ofText === null ? null : <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{` ${ofText}`}</Text>}
          </Text>
          {pending > 0 ? <StateBadge tone="slate" shape="sClock" label={t('grow.home.toConfirm', { count: pending })} /> : null}
        </View>
        <GrowGlyph name="chev" color={colors.inkFaint} size={16} />
      </View>
      {hasSize ? <ProgressBar percent={percent} variant="thin" tone="blue" animate={animate} /> : null}
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{line}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  tile: { width: 64, height: 64, borderRadius: radii.glyphTile, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.gapSm },
});
