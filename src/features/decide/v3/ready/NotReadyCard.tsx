/**
 * 05.3-26 (D-06): the not-ready checklist card. One row per missing item in the fixed order (last month, this month,
 * envelopes). Each row reads "{title}. {reason}. {button}" and opens Activity or the Envelopes screen. It stands in place of
 * a verdict, never beside one. Rows stack (text above the button) so a long word never clips at 320 wide or 2.0x text.
 */
import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import type { Readiness, YearMonth } from '@/engine/decide/v3';
import { notReadyRows, type NotReadyRow } from '@/features/decide/v3/model/notReady';
import { ENVELOPES_HREF } from '@/features/decide/v3/nav/hrefs';
import { useV3Format } from '@/features/decide/v3/shared/useV3Format';
import { getAnalytics } from '@/services/analytics';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';

type Translate = (key: string, options?: Record<string, unknown>) => string;
type Count = '1' | '2' | '3';

export interface NotReadyCardProps {
  readiness: Readiness | undefined;
  thisMonth: YearMonth;
  /** Fired once when the last row goes: the parent announces "Decide can check a purchase now." */
  onReady?: () => void;
}

export function NotReadyCard({ readiness, thisMonth, onReady }: NotReadyCardProps): React.JSX.Element | null {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors, pairing } = useTheme();
  const rows = notReadyRows(readiness, thisMonth);
  const count = rows.length;
  const first = rows[0]?.code;

  const hadRows = useRef(false);
  const shown = useRef(false);
  useEffect(() => {
    if (count > 0) {
      hadRows.current = true;
      if (!shown.current && first !== undefined) {
        shown.current = true;
        getAnalytics().track('decide_not_ready_shown', { first, count: String(count) as Count });
      }
    } else if (hadRows.current) {
      hadRows.current = false;
      onReady?.();
    }
  }, [count, first, onReady]);

  if (count === 0) return null;

  const open = (row: NotReadyRow): void => {
    // The Activity tab reads no month parameter yet, so both Activity rows open the tab.
    if (row.target === 'envelopes') pushOnce(ENVELOPES_HREF);
    else router.navigate('/activity' as Href);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {t('decide.v3.ui.notReady.heading')}
      </Text>
      {rows.map((row, i) => {
        const title = t(row.titleKey, { month: row.month === null ? '' : f.month(row.month) });
        const reason = t(row.reasonKey);
        const button = t(row.buttonKey);
        return (
          <Pressable
            key={row.code}
            accessibilityRole="button"
            accessibilityLabel={t('decide.v3.ui.notReady.rowA11y', { title, reason, button })}
            onPress={() => open(row)}
            style={[styles.row, i > 0 ? { borderTopWidth: 1, borderTopColor: colors.line1 } : null]}
          >
            <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{title}</Text>
            <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.s13_5, color: colors.inkDim }}>{reason}</Text>
            <View style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.line4 }]}>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{button}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPadLg, gap: space.gapMd },
  row: { gap: space.gapSm, paddingTop: space.gapMd, minHeight: space.touchMin },
  button: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: space.touchMin,
    paddingHorizontal: space.cardPad,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
