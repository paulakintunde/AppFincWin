// 06.1-59 (G-10, owner decision 4, UX-16): the shared "More" row. Figures and caveats a card does not need in view sit behind it and
// open in place, directly below. A full-width row at least 44 pt tall with a chevron that points down when closed and up when open;
// the row reads "Less" while open unless the caller names it. A button with an expanded state. It opens without animation, so
// Reduce Motion has nothing to turn off, and its text wraps at any font size. Presentational: useT and useTheme only.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';
import { hapticSelection } from '@/ui/haptics';
import { Text } from '@/ui/Text';
import { DisclosureBody } from './WhyLine';

export interface MoreRowProps {
  /** What opens below the row. A string is drawn as one small line. */
  children: React.ReactNode;
  /** The row's own words; absent = "More" (and "Less" while open). */
  label?: string;
  testID?: string;
}

export function MoreRow({ children, label, testID = 'more-row' }: MoreRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [open, setOpen] = useState(false);
  const words = label ?? t(open ? 'decide.screens.common.less' : 'decide.screens.common.more');
  return (
    <View style={styles.wrap}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={words}
        accessibilityHint={open ? undefined : t('decide.screens.common.a11y.moreHint')}
        onPress={() => {
          hapticSelection();
          setOpen((o) => !o);
        }}
        style={({ pressed }) => [styles.row, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <Text style={{ ...textRole(pairing, 'label'), fontWeight: '600', color: colors.accent, flexShrink: 1 }}>{words}</Text>
        {/* The Row chevron, turned down when closed and up when open: a swap, not an animation. */}
        <View testID={`${testID}-chevron-${open ? 'up' : 'down'}`} style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <StateGlyph name="chev" color={colors.accent} size={16} />
        </View>
      </Pressable>
      {open ? <DisclosureBody testID={`${testID}-body`}>{children}</DisclosureBody> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  row: { alignSelf: 'stretch', minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
});
