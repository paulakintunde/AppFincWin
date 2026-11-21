// 06.1-14 (UX-32, CO-D-64 (4)): the slim action bar. It is the last thing in reading order and rides above the Android keyboard.
// 08.1-14 (D-06, UX-10): with no ready date inside a year, the cheaper one (when there is one) then Save for it lead, with the same
// pill look; "I bought it" follows in that same look, so no choice is drawn as the better one.
import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space, useScreenInsets } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { LINK_HIT_SLOP, usePressFeedback } from '@/ui/pressFeedback';
import { Text } from '@/ui/Text';

export interface ActionBarProps {
  onBought: () => void;
  onSaveFor: () => void;
  onNotBuying: () => void;
  /** 08.1-14 (D-06): no ready date within a year. Absent = false: the bar as before. */
  notWithinYear?: boolean;
  /** 08.1-14 (D-06): the cheaper one, offered first when `notWithinYear`; absent = no cheaper price. */
  onCheaper?: () => void;
}

export function ActionBar({ onBought, onSaveFor, onNotBuying, notWithinYear = false, onCheaper }: ActionBarProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  // 06.1-62 (CB-3): edge-to-edge always, so the bar clears the Android nav bar (3-button or gesture strip) and the iOS home indicator.
  const insets = useScreenInsets();
  const press = usePressFeedback('row');
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View testID="answer-actions" accessibilityLabel={t('decide.screens.answer.frame.actionsA11y')} style={[styles.bar, { backgroundColor: colors.surface, paddingBottom: insets.bottom + space.gapSm }]}>
        <View style={styles.pills}>
          {notWithinYear ? (
            <>
              {onCheaper !== undefined ? (
                <View testID="answer-action-cheaper">
                  <Pill variant="secondary" label={t('decide.screens.answer.options.cheaper')} onPress={onCheaper} />
                </View>
              ) : null}
              <View testID="answer-action-saveFor">
                <Pill variant="secondary" label={t('decide.screens.answerActions.bar.saveForIt')} onPress={onSaveFor} />
              </View>
              <Pill variant="secondary" label={t('decide.screens.answerActions.bar.bought')} onPress={onBought} />
            </>
          ) : (
            <>
              <Pill variant="primary" label={t('decide.screens.answerActions.bar.bought')} onPress={onBought} />
              <Pill variant="secondary" label={t('decide.screens.answerActions.bar.saveForIt')} onPress={onSaveFor} />
            </>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onNotBuying}
          hitSlop={LINK_HIT_SLOP}
          android_ripple={press.android_ripple}
          style={({ pressed }) => [styles.link, press.pressedStyle(pressed)]}
        >
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
