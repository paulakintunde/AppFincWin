// NAV-03 / D-22: pushed detail screens live in the outer (app) Stack and cover the tab bar; the
// native stack supplies the push and the iOS edge swipe, SwipeBack the Android edge swipe (D-07).
// Later phases' new detail screens use this; Record's existing screens keep their own headers.
import React, { useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '@/ui/Text';
import { DetailHeader } from '@/shell/header/DetailHeader';
import { SyncProblemLine } from '@/shell/header/SyncProblemLine';
import * as a11yFocus from '@/shell/a11yFocus';
import { useTheme } from '@/theme/ThemeProvider';
import { space, useScreenInsets } from '@/theme/layout';

type TextRef = React.ComponentRef<typeof Text>;

export interface DetailScreenProps {
  title: string;
  right?: React.ReactNode;
  scroll?: boolean;
  children?: React.ReactNode;
}

export function DetailScreen({ title, right, scroll, children }: DetailScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const titleRef = useRef<TextRef>(null);
  a11yFocus.useScreenTitleFocus(titleRef as never);
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <DetailHeader title={title} right={right} titleRef={titleRef} />
      <SyncProblemLine />
      {scroll !== false ? (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: space.screenH,
            paddingBottom: insets.bottom + space.groupGap,
          }}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </View>
  );
}
