// NAV-03/D-05: header for pushed detail screens: 38px history-aware back, a 16/600 title that wraps at large
// text sizes (05.3-50 F2: never an ellipsis), and an optional trailing slot owned by the record's phase.
import React from 'react';
import { View } from 'react-native';
import { Text } from '@/ui/Text';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { space, useScreenInsets } from '@/theme/layout';
import { fontSize } from '@/theme/typography';
import { BackButton } from './BackButton';

type TextRef = React.ComponentRef<typeof Text>;

export interface DetailHeaderProps {
  title: string;
  right?: React.ReactNode;
  titleRef?: React.Ref<TextRef>;
}

export function DetailHeader({ title, right, titleRef }: DetailHeaderProps): React.JSX.Element {
  const { colors, fonts } = useTheme();
  const insets = useScreenInsets();
  const { goBack } = useBackHistory();
  return (
    <View
      style={{
        paddingTop: insets.top + space.detailHeaderPadTop,
        paddingHorizontal: space.detailHeaderPadH,
        paddingBottom: space.detailHeaderPadBottom,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.gapMd,
        borderBottomWidth: 1,
        borderBottomColor: colors.line1,
        backgroundColor: colors.canvas,
      }}
    >
      <BackButton variant="detail" onPress={goBack} />
      <Text
        ref={titleRef}
        accessibilityRole="header"
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: fonts.body[600],
          fontSize: fontSize.sheetTitle,
          letterSpacing: fontSize.sheetTitle * -0.01,
          color: colors.ink,
        }}
      >
        {title}
      </Text>
      {right}
    </View>
  );
}
