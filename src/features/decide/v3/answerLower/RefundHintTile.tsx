/**
 * 05.3-38 (D-13): "With the refund, this could fit now. Check again." One element. Pressing starts a NEW check through
 * useReopenCheck (reopened_from = this check) and opens its answer; the stored answer on the original row is never changed.
 */
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import { useReopenCheck } from '@/data/mutations/decideChecks';
import { useT } from '@/i18n';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { Text } from '@/ui/Text';
import { answerHref } from '@/features/decide/v3/nav/hrefs';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const TILE_RADIUS = 16;

export function RefundHintTile({ show, row }: { show: boolean; row: DecideCheckRow }): React.JSX.Element | null {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const { reopen } = useReopenCheck();
  if (!show) return null;
  const onPress = (): void => {
    const newId = reopen(row, new Date().toISOString().slice(0, 10));
    pushOnce(answerHref(newId));
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('decide.v3.ui.answer.refundHintA11y')}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: colors.fill2, opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.s13_5, color: colors.ink }}>
        {`${t('decide.v3.ui.answer.refundHint')} `}
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink, textDecorationLine: 'underline' }}>
          {t('decide.v3.ui.answer.checkAgain')}
        </Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { minHeight: space.touchMin, justifyContent: 'center', borderRadius: TILE_RADIUS, paddingVertical: space.gapMd, paddingHorizontal: 14 },
});
