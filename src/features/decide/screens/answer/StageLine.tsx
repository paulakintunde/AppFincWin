// 08.1-20 (DCU-10): the stage sentence under the basis sentence, with one link to import. Stages 1 and 2 only (UI-SPEC section 1);
// nothing at the deeper stage. Never a state colour: the link is the accent, the sentence is body ink.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import type { StageReading } from '@/engine/decide/v3';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { LINK_HIT_SLOP, usePressFeedback } from '@/ui/pressFeedback';

export function StageLine({ reading, onImport }: { reading: StageReading; onImport: () => void }): React.JSX.Element | null {
  const t = useT();
  const { colors, pairing } = useTheme();
  const press = usePressFeedback('row');
  if (reading.stage === 'deeper') return null;
  const first = reading.stage === 'first_read';
  const sentence = first ? t('decide.screens.stage.line.first_read') : t('decide.screens.stage.line.full', { monthsUsed: reading.monthsUsed });
  const link = t(first ? 'decide.screens.stage.line.importLink' : 'decide.screens.stage.line.addLink');
  return (
    <View testID="answer-stage-line" style={styles.block}>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{sentence}</Text>
      <Pressable
        testID="answer-stage-link"
        accessibilityRole="link"
        onPress={onImport}
        hitSlop={LINK_HIT_SLOP}
        android_ripple={press.android_ripple}
        style={({ pressed }) => [styles.link, press.pressedStyle(pressed)]}
      >
        <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{link}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
