// D-04/D-14/D-19: the large tab-root header: optional date eyebrow, 26/700 heading-role title that
// wraps (no numberOfLines) at large text sizes, optional screen-owned controls, and the avatar.
import React from 'react';
import { View } from 'react-native';
import { Text } from '@/ui/Text';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { space, useScreenInsets } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { AvatarButton } from './AvatarButton';
import { BackButton } from './BackButton';

type TextRef = React.ComponentRef<typeof Text>;

export interface TabHeaderProps {
  title: string;
  eyebrow?: string;
  titleRef?: React.Ref<TextRef>;
  /** Default true. */
  showAvatar?: boolean;
  /** Screen-owned controls placed before the avatar (e.g. Activity's month arrows). */
  trailing?: React.ReactNode;
}

export function TabHeader({ title, eyebrow, titleRef, showAvatar, trailing }: TabHeaderProps): React.JSX.Element {
  const { colors, fonts, pairing } = useTheme();
  const insets = useScreenInsets();
  const { canGoBack, goBack } = useBackHistory();
  return (
    <View
      testID="tab-header"
      style={{
        paddingTop: insets.headerTop,
        paddingHorizontal: space.screenH,
        paddingBottom: space.tabHeaderPadBottom,
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: space.tabHeaderGap,
      }}
    >
      {canGoBack ? <BackButton variant="compact" onPress={goBack} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? (
          <Text
            style={{
              fontFamily: fonts.body[600],
              fontSize: fontSize.eyebrow,
              letterSpacing: fontSize.eyebrow * 0.16,
              color: colors.inkMuted,
            }}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text
          ref={titleRef}
          accessibilityRole="header"
          style={{
            ...textRole(pairing, 'heading'),
            color: colors.ink,
            marginTop: eyebrow ? space.eyebrowGap : 0,
          }}
        >
          {title}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.gapSm }}>
        {trailing}
        {showAvatar !== false ? <AvatarButton /> : null}
      </View>
    </View>
  );
}
