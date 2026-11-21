// 08.1-23 (owner 2026-11-21): the small tap-to-explain line under a household setting. FincWin's icon set has no info glyph, so this
// reuses the app's own "Why?" pattern (decide/screens/ui/WhyLine): a text link, at least 44 pt tall, that opens one or two short
// sentences in place, directly below, and reads "Less" while open. A button with an expanded state whose spoken label names the
// setting ("What A set spending split means"); the opened text is a polite live region, so a screen reader hears it and can reach it.
// It opens without animation, so Reduce Motion has nothing to turn off. Text wraps at any size.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, space, step } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticTick } from '@/ui/haptics';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { Text } from '@/ui/Text';

export interface ExplainTipProps {
  /** The setting's own name, spoken in the button label. */
  name: string;
  /** One or two short sentences on what the setting does to the answer. */
  text: string;
  testID?: string;
}

export function ExplainTip({ name, text, testID = 'explain-tip' }: ExplainTipProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.wrap}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={open ? t('household.rules.explain.less') : t('household.rules.explain.a11y', { name })}
        accessibilityState={{ expanded: open }}
        hitSlop={LINK_HIT_SLOP}
        onPress={() => {
          hapticTick();
          setOpen((o) => !o);
        }}
        style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <Text style={{ ...textRole(pairing, 'label'), fontWeight: '600', color: colors.accent }}>
          {t(open ? 'household.rules.explain.less' : 'household.rules.explain.button')}
        </Text>
      </Pressable>
      {open ? (
        <Text testID={`${testID}-text`} accessibilityLiveRegion="polite" style={[styles.body, { ...textRole(pairing, 'label'), color: colors.inkMuted }]}>
          {text}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
  body: { paddingBottom: step.tight },
});
