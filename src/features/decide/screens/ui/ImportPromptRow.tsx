// 08.1-21 (DCU-10, UI-SPEC section 1 "ImportPromptRow"): the 64 pt import row on Decide home, the Not ready card's neighbour and the
// Records setup item. Shown below 3 months of records only. Calm: never red, never dismissible, never a push notification.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { STAGE_DEEPER_MIN_MONTHS } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';
import { IconTile } from '@/ui/icons/IconTile';
import { usePressFeedback } from '@/ui/pressFeedback';
import { Text } from '@/ui/Text';

const CHEV = 16;
const ROW_MIN = 64;

export function ImportPromptRow({ monthsUsed, onPress }: { monthsUsed: number; onPress: () => void }): React.JSX.Element | null {
  const t = useT();
  const { colors, pairing } = useTheme();
  const press = usePressFeedback('row');
  if (monthsUsed >= STAGE_DEEPER_MIN_MONTHS) return null;
  const first = monthsUsed <= 0;
  const title = t(first ? 'decide.screens.stage.import.firstTitle' : 'decide.screens.stage.import.moreTitle');
  const sub = t(first ? 'decide.screens.stage.import.firstSub' : 'decide.screens.stage.import.moreSub');
  return (
    <Pressable
      testID="import-prompt"
      accessibilityRole="button"
      accessibilityLabel={t('decide.screens.stage.import.a11y', { title, sub })}
      onPress={onPress}
      android_ripple={press.android_ripple}
      style={({ pressed }) => [styles.row, press.pressedStyle(pressed)]}
    >
      <IconTile icon="import" size={36} color={colors.ink} tint={colors.fill1} />
      <View style={styles.text}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{title}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{sub}</Text>
      </View>
      <StateGlyph name="chev" color={colors.inkFaint} size={CHEV} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: ROW_MIN, flexDirection: 'row', alignItems: 'center', gap: space.gapMd, paddingVertical: space.gapSm },
  text: { flex: 1, gap: space.gapSm },
});
