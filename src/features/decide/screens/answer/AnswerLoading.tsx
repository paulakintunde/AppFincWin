// 06.1-49 (A-ANS-2, G-2): the answer's loading state. From Check it until the engine has an answer, the screen shows its top bar (once
// the check is known) and "Working out the answer", never a blank body. The indicator is the system spinner (allowed under Reduce
// Motion); no new animation. The text is a polite live region so a screen reader hears it once (D-56 style).
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space, useScreenInsets } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { AnswerTopBar, type AnswerTopBarProps } from './AnswerTopBar';

/** The spinner and the line, for use under a top bar that is already drawn (AnswerFrame). */
export function AnswerLoadingBody() {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View testID="answer-loading" style={styles.body}>
      <ActivityIndicator color={colors.accent} />
      <Text accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'body'), color: colors.inkDim, textAlign: 'center' }}>
        {t('decide.screens.answer.loading')}
      </Text>
    </View>
  );
}

export interface AnswerLoadingProps {
  /** The top bar, when the check is already known. Absent while the check itself is still loading. */
  top?: AnswerTopBarProps;
}

/** The whole loading screen, inside the safe area. */
export function AnswerLoading({ top }: AnswerLoadingProps) {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  return (
    <View testID="answer-loading-screen" style={[styles.frame, { backgroundColor: colors.canvas, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {top !== undefined ? <AnswerTopBar {...top} /> : null}
        <AnswerLoadingBody />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  content: { padding: space.screenH, gap: space.groupGap, flexGrow: 1 },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: space.gapMd, paddingVertical: space.groupGap },
});
