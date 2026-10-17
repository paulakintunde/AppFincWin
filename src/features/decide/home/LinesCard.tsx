/**
 * 05-27 (DCU-03, D-14, D-15): "Lines you will not cross". Five tappable rows showing the user's stored value, or the
 * engine default (prepareContext(snapshot).context.limits) with a 'default' tag while the setting is blank. Open checks
 * recompute from the same settings cache, so a saved limit reaches them in the same render cycle.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { DecideSettingsRow } from '@/db/decideSettings';
import { prepareContext, type ResolvedLimits } from '@/engine/decide';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { Card, Meta, type Money } from '../check/steps/stepUi';
import { percentText } from '../copy/percentText';
import type { SnapshotResult } from '../snapshot/types';
import { LimitEditorSheet, type LimitKey } from './LimitEditorSheet';

export interface LinesCardProps {
  source: SnapshotResult | null;
  settings: DecideSettingsRow | null;
  userId: string | null;
  currency: string;
  whole: Money;
}

const KEYS: readonly LimitKey[] = ['reserve', 'dsr', 'unsecured', 'investing', 'saving'];

export function LinesCard({ source, settings, userId, currency, whole }: LinesCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [editing, setEditing] = useState<LimitKey | null>(null);

  const limits: ResolvedLimits | null = useMemo(() => {
    if (source === null || source.kind !== 'logged') return null;
    const result = prepareContext(source.snapshot);
    return result.ok ? result.context.limits : null;
  }, [source]);

  // The builder ignores money limits stamped in another currency, so they read as blank here too.
  const foreign = settings !== null && settings.currency !== null && settings.currency !== currency;
  const stored = (key: LimitKey): string | null => {
    if (settings === null) return null;
    switch (key) {
      case 'reserve':
        return foreign || settings.reserve === null ? null : whole(settings.reserve);
      case 'investing':
        return foreign || settings.investing_floor === null ? null : whole(settings.investing_floor);
      case 'saving':
        return foreign || settings.saving_floor === null ? null : whole(settings.saving_floor);
      case 'dsr':
        return settings.dsr_line === null ? null : t('decide.lines.dsr.value', { pct: settings.dsr_line });
      case 'unsecured':
        return settings.unsecured_multiple === null ? null : t('decide.lines.unsecured.value', { count: settings.unsecured_multiple });
    }
  };
  const fallback = (key: LimitKey): string | null => {
    if (limits === null) return null;
    switch (key) {
      case 'reserve':
        return whole(limits.reserve);
      case 'investing':
        return whole(limits.investingFloor);
      case 'saving':
        return whole(limits.savingFloor);
      case 'dsr':
        return t('decide.lines.dsr.value', { pct: percentText(limits.dsrLine) });
      case 'unsecured':
        return t('decide.lines.unsecured.value', { count: limits.unsecuredIncomeMultiple });
    }
  };

  return (
    <View testID="lines-card" style={styles.wrap}>
      <Card style={{ padding: space.cardPadLg, gap: space.gapSm }}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
          {t('decide.lines.heading')}
        </Text>
        <Meta>{t('decide.lines.sub')}</Meta>
        {KEYS.map((key, i) => {
          const own = stored(key);
          const value = own ?? fallback(key);
          const isDefault = own === null;
          const name = t(`decide.lines.${key}.name` as const);
          const desc = t(`decide.lines.${key}.desc` as const);
          const tag = t('decide.lines.defaultTag');
          const a11y = [name, desc, value, isDefault ? tag : null].filter((p): p is string => p !== null && p !== '').join(', ');
          return (
            <Pressable
              key={key}
              testID={`line-row-${key}`}
              accessibilityRole="button"
              accessibilityLabel={a11y}
              onPress={() => setEditing(key)}
              style={({ pressed }) => [
                styles.row,
                i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.fill2 } : null,
                { opacity: pressed ? PRESSED_OPACITY : 1 },
              ]}
            >
              <View style={styles.text}>
                <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.body, color: colors.ink }}>{name}</Text>
                <Meta>{desc}</Meta>
              </View>
              <View style={styles.value}>
                {value !== null ? <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{value}</Text> : null}
                {isDefault ? (
                  <View style={[styles.tag, { backgroundColor: colors.fill1 }]}>
                    <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.tabLabel, color: colors.inkDim }}>{tag}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </Card>
      <LimitEditorSheet
        limit={editing}
        userId={userId}
        currency={currency}
        settings={settings}
        source={source}
        whole={whole}
        onClose={() => setEditing(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  row: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd, paddingVertical: space.gapSm },
  text: { flex: 1, flexShrink: 1 },
  value: { alignItems: 'flex-end', gap: 4 },
  tag: { paddingHorizontal: space.gapSm, paddingVertical: 2, borderRadius: radii.pill },
});
