/**
 * 09-16 (UI-SPEC section 7): the one card shape for every plan notice. A `surface` card on `shadows.card`, an optional
 * StatusBadge, a sheetTitle title, one body sentence and at most two actions (a small primary Pill and text links in the
 * accent colour, never red). Rises once (RiseIn; Reduce Motion draws it at once).
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Pill } from '@/ui/Pill';
import { RiseIn } from '@/ui/RiseIn';
import { Text } from '@/ui/Text';
import { Glyph } from '@/ui/icons/Glyph';
import type { IconName } from '@/ui/icons/iconData';
import { StatusBadge } from '@/ui/status/StatusBadge';
import type { StatusKey } from '@/ui/status/statusMap';
import { LINK_HIT_SLOP, usePressFeedback } from '@/ui/pressFeedback';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { shadows } from '@/theme/tokens';
import { textRole } from '@/theme/typography';

export interface NoticeAction {
  label: string;
  onPress: () => void;
  kind: 'primary' | 'link';
  /** 09-19: additive. A primary action can be held inert while its work runs, and carry a test id. */
  disabled?: boolean;
  testID?: string;
}

export interface NoticeCardProps {
  title: string;
  body: string;
  badge?: StatusKey;
  icon?: IconName;
  actions?: NoticeAction[];
  testID?: string;
}

/** A text link: accent colour, 44 dp target through the shared hit slop. */
export function PlanLink({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const { colors, pairing } = useTheme();
  const feedback = usePressFeedback('row');
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={LINK_HIT_SLOP}
      android_ripple={feedback.android_ripple}
      style={({ pressed }) => [styles.link, feedback.pressedStyle(pressed)]}
    >
      <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.accent }}>{label}</Text>
    </Pressable>
  );
}

export function NoticeCard({ title, body, badge, icon, actions, testID }: NoticeCardProps) {
  const { colors, pairing } = useTheme();
  const shown = (actions ?? []).slice(0, 2);
  return (
    <RiseIn>
      <View testID={testID} style={[styles.card, shadows.card, { backgroundColor: colors.surface }]}>
        {badge ? <StatusBadge status={badge} /> : null}
        <View style={styles.titleRow}>
          {icon ? <Glyph name={icon} size={20} color={colors.inkDim} /> : null}
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, flexShrink: 1 }}>
            {title}
          </Text>
        </View>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{body}</Text>
        {shown.length > 0 ? (
          <View style={styles.actions}>
            {shown.map((a) =>
              a.kind === 'primary' ? (
                <View key={a.label} testID={a.testID}>
                  <Pill label={a.label} variant="primary" disabled={a.disabled} onPress={a.onPress} />
                </View>
              ) : (
                <PlanLink key={a.label} label={a.label} onPress={a.onPress} testID={a.testID} />
              ),
            )}
          </View>
        ) : null}
      </View>
    </RiseIn>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  actions: { gap: space.gapSm, alignItems: 'flex-start', marginTop: space.gapSm },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
