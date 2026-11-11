// 06.1-39 (D38, D-17, D-03): setup finished. A tick draws once (drawn at once under Reduce Motion), a light tap plays, and a short list says
// where things live. D-03 keeps the third line off D38. Presentational: "Back to Decide" is a prop.
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { TickDrawAnimated } from '../motion/TickDrawAnimated';

export interface SetupDoneProps {
  onBack: () => void;
}

export function SetupDone({ onBack }: SetupDoneProps): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  useEffect(() => {
    hapticLight(); // D-17: a light tap; success is reserved for goals
  }, []);
  return (
    <Screen scroll>
      <View style={styles.block}>
        <View style={styles.tick}>
          <TickDrawAnimated color={colors.accent} testID="setup-done-tick" />
        </View>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('decide.screens.setup.done.title')}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.screens.setup.done.sub')}</Text>
        <View testID="setup-done-list" style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.setup.done.netAndGoals')}</Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.setup.done.loans')}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pill variant="primary" label={t('decide.screens.common.backToDecide')} onPress={onBack} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapMd },
  tick: { alignItems: 'center', paddingVertical: space.gapMd },
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  actions: { marginTop: space.gapMd },
});
