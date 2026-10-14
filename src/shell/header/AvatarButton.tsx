// D-04/D-22: the 42px avatar opens You as an outer-stack push that covers the tab bar. You is never a tab.
import React from 'react';
import { Pressable } from 'react-native';
import { router, type Href } from 'expo-router';
import { Text } from '@/ui/Text';
import { useProfile } from '@/features/you/useProfile';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { size } from '@/theme/layout';
import { fontSize } from '@/theme/typography';

export function AvatarButton() {
  const t = useT();
  const { colors, fonts } = useTheme();
  const { profile } = useProfile();
  const initial = (profile?.full_name ?? profile?.email ?? '').charAt(0).toUpperCase();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('shell.profile')}
      onPress={() => router.push('/you' as Href)}
      style={({ pressed }) => ({
        width: size.avatar,
        height: size.avatar,
        borderRadius: size.avatar / 2,
        backgroundColor: pressed ? colors.line2 : colors.line1,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Text
        importantForAccessibility="no"
        style={{ fontFamily: fonts.body[600], fontSize: fontSize.s13_5, color: colors.inkDim }}
      >
        {initial}
      </Text>
    </Pressable>
  );
}
