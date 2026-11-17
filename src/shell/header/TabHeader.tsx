// D-04/D-14/D-19: the large tab-root header: optional date eyebrow, 26/700 heading-role title that
// wraps (no numberOfLines) at large text sizes, optional screen-owned controls, and the avatar.
// 05.5 device fix (Pixel 6): at a large font scale, screen-owned controls take their own row above the title, so the title keeps the
// full width ("Can I afford it?" broke over three lines beside Decide's Past decisions pill).
import React, { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/ui/Text';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { useFontScale } from '@/theme/FontScaleProvider';
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
  /** D-93: false hides the back control (a tab root). Omitted: shown when the history can go back. */
  showBack?: boolean;
  /** 06.1-56 (X-3): the title's text role; Decide home's title is 'display' (the display face). Default 'heading'. */
  titleRole?: 'display' | 'heading';
}

/** At or above this font scale, a header with screen-owned controls stacks them above the title. */
export const TAB_HEADER_STACK_SCALE = 1.3;

export function TabHeader({ title, eyebrow, titleRef, showAvatar, trailing, showBack, titleRole = 'heading' }: TabHeaderProps): React.JSX.Element {
  const { colors, fonts, pairing } = useTheme();
  const insets = useScreenInsets();
  const { canGoBack, goBack } = useBackHistory();
  const fontScale = useFontScale();
  // Also stacks once the title is seen to wrap beside the controls (the Pixel 6 at 1.15x wrapped "Can I afford it?" onto three
  // lines). Sticky for this title and scale, so the full-width title (now one line) never flips it back.
  const wrapKey = `${title}|${fontScale}`;
  const [wrappedFor, setWrappedFor] = useState<string | null>(null);
  const stacked = trailing != null && (fontScale >= TAB_HEADER_STACK_SCALE || wrappedFor === wrapKey);
  const back = showBack ?? canGoBack ? <BackButton variant="compact" onPress={goBack} /> : null;
  const controls = (
    <View testID="tab-header-controls" style={{ flexDirection: 'row', alignItems: 'center', gap: space.gapSm }}>
      {trailing}
      {showAvatar !== false ? <AvatarButton /> : null}
    </View>
  );
  return (
    <View
      testID="tab-header"
      style={{
        paddingTop: insets.headerTop,
        paddingHorizontal: space.screenH,
        paddingBottom: space.tabHeaderPadBottom,
        flexDirection: stacked ? 'column' : 'row',
        alignItems: stacked ? 'stretch' : 'flex-start',
        justifyContent: 'space-between',
        gap: space.tabHeaderGap,
      }}
    >
      {stacked ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: back === null ? 'flex-end' : 'space-between' }}>
          {back}
          {controls}
        </View>
      ) : (
        back
      )}
      <View style={stacked ? { minWidth: 0 } : { flex: 1, minWidth: 0 }}>
        {eyebrow ? (
          <Text
            importantForAccessibility="no"
            accessibilityElementsHidden
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
          onTextLayout={(e) => {
            if (!stacked && trailing != null && e.nativeEvent.lines.length > 1) setWrappedFor(wrapKey);
          }}
          accessibilityLabel={eyebrow ? `${title}, ${eyebrow}` : undefined}
          style={{
            ...textRole(pairing, titleRole),
            color: colors.ink,
            marginTop: eyebrow ? space.eyebrowGap : 0,
          }}
        >
          {title}
        </Text>
      </View>
      {stacked ? null : controls}
    </View>
  );
}
