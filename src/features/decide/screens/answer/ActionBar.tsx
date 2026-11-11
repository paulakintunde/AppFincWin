// 06.1-14 (UX-32, CO-D-64 (4)): the slim action bar. It is the last thing in reading order and rides above the Android keyboard.
import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';

export interface ActionBarProps {
  onBought: () => void;
  onSaveFor: () => void;
  onNotBuying: () => void;
}

export function ActionBar({ onBought, onSaveFor, onNotBuying }: ActionBarProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View testID="answer-actions" accessibilityLabel={t('decide.screens.answer.frame.actionsA11y')} style={[styles.bar, { backgroundColor: colors.surface }]}>
        <View style={styles.pills}>
          <Pill variant="primary" label={t('decide.screens.answerActions.bar.bought')} onPress={onBought} />
          <Pill variant="secondary" label={t('decide.screens.answerActions.bar.saveForIt')} onPress={onSaveFor} />
        </View>
        <Pressable accessibilityRole="button" onPress={onNotBuying} style={styles.link}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t('decide.screens.answerActions.bar.notBuying')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: space.screenH, paddingVertical: space.gapSm, gap: space.gapSm },
  pills: { flexDirection: 'row', gap: space.gapSm, flexWrap: 'wrap' },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
