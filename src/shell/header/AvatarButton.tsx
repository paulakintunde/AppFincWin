// D-04/D-22: the 42px avatar opens You as an outer-stack push that covers the tab bar. You is never a tab.
import React from 'react';
import { Pressable, View } from 'react-native';
import type { Href } from 'expo-router';
import { Text } from '@/ui/Text';
import { useProfile } from '@/features/you/useProfile';
import { useT } from '@/i18n';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { size, space } from '@/theme/layout';
import { fontSize } from '@/theme/typography';

export function AvatarButton() {
  const t = useT();
  const { colors, fonts } = useTheme();
  const { profile } = useProfile();
  const { locale } = useDeviceLocale();
  // L3: first code point (never half a surrogate pair), upper-cased for the device locale.
  const raw = (profile?.full_name ?? profile?.email ?? '').trim();
  const initial = Array.from(raw)[0]?.toLocaleUpperCase(locale) ?? '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('shell.profile')}
      hitSlop={(space.touchMin - size.avatar) / 2}
      onPress={() => pushOnce('/you' as Href)}
      style={({ pressed }) => ({
        width: size.avatar,
        height: size.avatar,
        borderRadius: size.avatar / 2,
        backgroundColor: pressed ? colors.line2 : colors.line1,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      {initial === '' ? (
      <View
        testID="avatar-person-glyph"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ alignItems: 'center' }}
      >
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.inkDim }} />
        <View
          style={{
            width: 20,
            height: 9,
            marginTop: 2,
            borderTopLeftRadius: 10,
            borderTopRightRadius: 10,
            backgroundColor: colors.inkDim,
          }}
        />
      </View>
      ) : (
      <Text
        importantForAccessibility="no"
        style={{ fontFamily: fonts.body[600], fontSize: fontSize.s13_5, color: colors.inkDim }}
      >
        {initial}
      </Text>
      )}
    </Pressable>
  );
}
