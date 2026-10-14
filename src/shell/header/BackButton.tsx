// D-05/D-14: the circular back chevron. 'compact' (36) sits in tab headers, 'detail' (38) in pushed
// detail headers. The chevron is a rotated bordered box (no icon library, per the design contract).
import React from 'react';
import { Pressable, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { size, space } from '@/theme/layout';

export function BackButton({ variant, onPress }: { variant: 'compact' | 'detail'; onPress(): void }) {
  const t = useT();
  const { colors } = useTheme();
  const dim = variant === 'compact' ? size.backCompact : size.backDetail;
  const c = variant === 'compact' ? size.chevronCompact : size.chevronDetail;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('a11y.back')}
      hitSlop={(space.touchMin - dim) / 2}
      onPress={onPress}
      style={({ pressed }) => ({
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.line3 : colors.fill1,
      })}
    >
      <View
        style={{
          width: c,
          height: c,
          borderLeftWidth: 2,
          borderBottomWidth: 2,
          borderColor: colors.ink,
          transform: [{ rotate: '45deg' }],
          marginLeft: space.chevronNudge,
        }}
      />
    </Pressable>
  );
}
