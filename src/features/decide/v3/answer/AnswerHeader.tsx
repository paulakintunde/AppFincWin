/**
 * 05.3-41 (UI-SPEC Answer header): the round back control ("Back to the check"), the "{Item} · {price}" title as one button
 * ("Change details", back to the check to edit it) and the "B{n}" band badge. The item may ellipsize (rule T); the full name
 * and price are in the button's label. The title is the screen's heading, so focus lands on it when the screen opens.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Band } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { PRESSED_OPACITY, radii, size, space, useScreenInsets } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { purchaseHref } from '../nav/hrefs';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface AnswerHeaderProps {
  checkId: string;
  item: string;
  /** The formatted price, already written in the user's currency. */
  price: string;
  band: Band | null;
  titleRef?: React.Ref<React.ComponentRef<typeof Text>>;
}

export function AnswerHeader({ checkId, item, price, band, titleRef }: AnswerHeaderProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const insets = useScreenInsets();
  const { goBack } = useBackHistory();
  const dim = size.backDetail;
  const title = item.length === 0 ? price : price.length === 0 ? item : `${item} · ${price}`;
  return (
    <View
      style={[
        styles.row,
        {
          paddingTop: insets.top + space.detailHeaderPadTop,
          paddingHorizontal: space.detailHeaderPadH,
          paddingBottom: space.detailHeaderPadBottom,
          borderBottomColor: colors.line1,
          backgroundColor: colors.canvas,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('decide.v3.ui.answer.back')}
        hitSlop={(space.touchMin - dim) / 2}
        onPress={() => goBack()}
        style={({ pressed }) => [
          styles.back,
          { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: pressed ? colors.line3 : colors.fill1 },
        ]}
      >
        <View
          style={{
            width: size.chevronDetail,
            height: size.chevronDetail,
            borderLeftWidth: 2,
            borderBottomWidth: 2,
            borderColor: colors.ink,
            transform: [{ rotate: '45deg' }],
            marginLeft: space.chevronNudge,
          }}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${t('decide.v3.ui.answer.changeDetails')}`}
        onPress={() => pushOnce(purchaseHref(checkId))}
        style={({ pressed }) => [styles.titleHit, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <Text
          ref={titleRef}
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{ ...textRole(pairing, 'sheetTitle'), fontSize: fontSize.sheetTitle, color: colors.ink }}
        >
          {title}
        </Text>
      </Pressable>
      {band === null ? null : (
        <View
          accessible
          accessibilityLabel={t('decide.v3.ui.band.badgeA11y', { n: band })}
          style={[styles.badge, { backgroundColor: colors.fill1 }]}
        >
          <Text scale="capped" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>
            {t('decide.v3.ui.band.badge', { n: band })}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, borderBottomWidth: 1 },
  back: { alignItems: 'center', justifyContent: 'center' },
  titleHit: { flex: 1, minHeight: space.touchMin, justifyContent: 'center' },
  badge: { paddingHorizontal: space.gapMd, paddingVertical: 4, borderRadius: radii.pill },
});
