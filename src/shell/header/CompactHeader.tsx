// D-14/D-15: the compact header shown once the large one has scrolled away. Opacity is driven by the
// caller (03-11) through animatedStyle; while invisible it is removed from touch and screen readers.
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '@/ui/Text';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { space, useScreenInsets } from '@/theme/layout';
import { textRole, type TextRole } from '@/theme/typography';
import { AvatarButton } from './AvatarButton';
import { BackButton } from './BackButton';
import { SyncProblemLine } from './SyncProblemLine';

type TextRef = React.ComponentRef<typeof Text>;

export interface CompactHeaderProps {
  title: string;
  visible: boolean;
  animatedStyle?: StyleProp<ViewStyle>;
  showAvatar?: boolean;
  titleRef?: React.Ref<TextRef>;
  /** 03.1 D-58: controls shown after the title (Activity's Search / Filter / More). */
  trailing?: React.ReactNode;
  /** 03.1 D-58: title text role; defaults to the Phase 3 compact 'heading'. */
  titleRole?: Extract<TextRole, 'heading' | 'sheetTitle'>;
  /** D-93: false hides the back control (a tab root). Omitted: shown when the history can go back. */
  showBack?: boolean;
}

export function CompactHeader({
  title,
  visible,
  animatedStyle,
  showAvatar,
  titleRef,
  trailing,
  titleRole,
  showBack,
}: CompactHeaderProps): React.JSX.Element {
  const { colors, pairing } = useTheme();
  const insets = useScreenInsets();
  const { canGoBack, goBack } = useBackHistory();
  return (
    <Animated.View
      testID="compact-header"
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top + space.gapSm,
          backgroundColor: colors.canvas,
          borderBottomWidth: 1,
          borderBottomColor: colors.line1,
        },
        animatedStyle,
      ]}
    >
      <View
        style={{
          paddingBottom: space.gapSm,
          paddingHorizontal: space.screenH,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.gapMd,
        }}
      >
        {showBack ?? canGoBack ?<BackButton variant="compact" onPress={goBack} /> : null}
        <Text
          ref={titleRef}
          accessibilityRole="header"
          numberOfLines={1}
          style={{ ...textRole(pairing, titleRole ?? 'heading'), color: colors.ink, flex: 1 }}
        >
          {title}
        </Text>
        {trailing}
        {showAvatar !== false ? <AvatarButton /> : null}
      </View>
      <SyncProblemLine />
    </Animated.View>
  );
}
