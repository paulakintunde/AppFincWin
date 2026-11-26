// UI-SPEC primitive: a circle in the member colour with a white initial. The initial is the first letter of the name the
// viewer sees (the colour name when the name is hidden). A former member shows the profile icon. A name always sits beside it.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Glyph } from '@/ui/icons/Glyph';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { memberColors } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { householdIcons } from '../glyphs';
import { useMemberLabel, useMemberSeen } from '../useMemberLabel';

export type MemberAvatarSize = 28 | 32 | 36 | 40;

export interface MemberAvatarProps {
  householdId: string | null | undefined;
  userId: string | null;
  size?: MemberAvatarSize;
  /** When given with `percent`, the avatar speaks "Sam, Flatmate, 45 percent". */
  role?: string;
  percent?: number;
}

export function MemberAvatar({ householdId, userId, size = 32, role, percent }: MemberAvatarProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const label = useMemberLabel(householdId);
  const seen = useMemberSeen(householdId);
  const info = userId === null ? null : seen(userId);
  const former = info === null || info.seen === null;
  const background = former ? colors.fill2 : memberColors[info.colourKey] ?? memberColors[0];
  const initial = former ? '' : Array.from(info.seen ?? '')[0]?.toUpperCase() ?? '';
  const spoken =
    role !== undefined && percent !== undefined
      ? t('household.members.avatarA11y', { name: label(userId), role, percent })
      : label(userId);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={spoken}
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }]}
    >
      {former ? (
        <Glyph name={householdIcons.person} size={16} color={colors.inkMuted} />
      ) : (
        <Text
          scale="capped"
          style={{ ...textRole(pairing, 'label'), fontSize: size >= 40 ? fontSize.body : fontSize.label, color: colors.surface }}
        >
          {initial}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
});
