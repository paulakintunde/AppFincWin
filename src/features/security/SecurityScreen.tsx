// 10-27 (UI-SPEC section 2): the Security screen. The phone lock first, the signed-in devices below it, and the
// app-switcher line last, so it reads once for the whole screen (LockSection is told not to repeat it).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { BackButton } from '@/shell/header/BackButton';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { DevicesSection } from './DevicesSection';
import { LockSection, SwitcherMetaLine } from './LockSection';

export function SecurityScreen(): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { goBack } = useBackHistory();
  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <View style={styles.column} testID="security-screen">
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('system.security.title')}
        </Text>
        <LockSection showSwitcherMeta={false} />
        <DevicesSection />
        <SwitcherMetaLine />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapSm },
  column: { gap: space.groupGap, paddingBottom: space.sheetPadBottom },
});
