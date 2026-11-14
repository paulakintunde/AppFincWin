// 06.1-59 (G-10, owner decision 4, UX-16): the shared "Why?" link. A Decide card keeps one short line in view; the reason for it sits
// behind this link and opens in place, directly below. Nothing is removed, only moved one tap away. The link reads "Less" while
// open. A button with an expanded state, at least 44 pt tall. It opens without animation, so Reduce Motion has nothing to turn off.
// Text wraps at any font size (no line clamps). Presentational: useT and useTheme only.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { Text } from '@/ui/Text';

export interface WhyLineProps {
  /** What opens below the link: a sentence (drawn as a small line) or any content. */
  children: React.ReactNode;
  testID?: string;
}

/** A string child is drawn as one small line; anything else is drawn as given. */
export function DisclosureBody({ children, testID }: { children: React.ReactNode; testID: string }) {
  const { colors, pairing } = useTheme();
  return (
    <View testID={testID} style={styles.body}>
      {typeof children === 'string' ? (
        <Text accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

export function WhyLine({ children, testID = 'why-line' }: WhyLineProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.wrap}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? undefined : t('decide.screens.common.a11y.whyHint')}
        hitSlop={LINK_HIT_SLOP}
        onPress={() => {
          hapticSelection();
          setOpen((o) => !o);
        }}
        style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <Text style={{ ...textRole(pairing, 'label'), fontWeight: '600', color: colors.accent }}>{t(open ? 'decide.screens.common.less' : 'decide.screens.common.why')}</Text>
      </Pressable>
      {open ? <DisclosureBody testID={`${testID}-body`}>{children}</DisclosureBody> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
  body: { gap: space.gapSm, paddingBottom: space.gapSm },
});
