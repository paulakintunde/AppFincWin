/**
 * UI-SPEC Design System: the shared empty-state block (Activity/Accounts/Categories with no rows).
 * 06.2 D-24: a 48 icon tile + one heading + one sentence + one button. With no icon and no action it keeps the
 * earlier form (heading in the body role, body line in the label role, muted, centred) so current callers are
 * unchanged until they adopt the new props. There is deliberately no second-button prop.
 */
import React, { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { IconTile } from '@/ui/icons/IconTile';
import type { IconName } from '@/ui/icons/iconData';
import { useTheme } from '@/theme/ThemeProvider';
import { ACCENT_TINT_OPACITY } from '@/theme/tokens';
import { space, step, tile } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export interface EmptyStateProps {
  heading: string;
  body: string;
  icon?: IconName;
  iconColor?: string;
  iconTint?: string;
  /** Replaces the tile (an animated icon, plan 18). */
  iconSlot?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

/** M4: an accent tint is the accent at ACCENT_TINT_OPACITY over fill1, flattened to one opaque colour for the tile. */
export function accentTintOver(base: string, accent: string, alpha: number = ACCENT_TINT_OPACITY): string {
  const rgb = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  };
  const b = rgb(base);
  const a = rgb(accent);
  const mixed = b.map((v, i) => Math.round(v * (1 - alpha) + (a[i] ?? v) * alpha));
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function EmptyState({ heading, body, icon, iconColor, iconTint, iconSlot, actionLabel, onAction, testID }: EmptyStateProps) {
  const { colors, pairing } = useTheme();
  const full = icon !== undefined || iconSlot !== undefined || (actionLabel !== undefined && onAction !== undefined);
  // A body that wraps stays centred under the heading.
  const headingStyle = { ...textRole(pairing, full ? 'bodyStrong' : 'body'), color: colors.ink, textAlign: 'center' as const };
  const bodyStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' as const };

  if (!full) {
    return (
      <View testID={testID} style={styles.legacy}>
        <Text accessibilityRole="header" style={headingStyle}>
          {heading}
        </Text>
        <Text style={bodyStyle}>{body}</Text>
      </View>
    );
  }

  const art =
    iconSlot ??
    (icon !== undefined ? (
      <IconTile
        testID="empty-state-tile"
        icon={icon}
        size={tile.big}
        color={iconColor ?? colors.accent}
        tint={iconTint ?? accentTintOver(colors.fill1, colors.accent)}
      />
    ) : null);

  return (
    <View testID={testID} style={styles.container}>
      {art !== null ? <View style={styles.art}>{art}</View> : null}
      <Text accessibilityRole="header" style={headingStyle}>
        {heading}
      </Text>
      <Text style={[bodyStyle, styles.body]}>{body}</Text>
      {actionLabel !== undefined && onAction !== undefined ? (
        <View style={styles.action}>
          <Pill label={actionLabel} variant="primary" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  legacy: {
    alignItems: 'center',
    gap: space.gapSm,
  },
  container: {
    alignItems: 'center',
    padding: step.card,
  },
  art: {
    marginBottom: step.row,
  },
  body: {
    marginTop: step.tight,
  },
  action: {
    marginTop: step.card,
  },
});
