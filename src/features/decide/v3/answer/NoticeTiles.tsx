/**
 * 05.3-25 (UI-SPEC Notices, D-46, D-48): one fill2 tile per notice the engine returned, in engine order, none added.
 * The catalogue key and plain params come from noticeCopy (singular forms, lean-month wording with the absolute amount).
 * Then months and dates are written out, money is formatted (never a float), and ids become names (COPY_RESOLVERS in
 * useV3Format.flat). A tile has no icon; its words are the whole message.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Notice, NoticeCode } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { noticeCopy } from '../model/copyPick';
import { useV3Format } from '../shared/useV3Format';

/** Which values of each notice are minor-unit money. Everything else passes through as written. */
const MONEY_KEYS: Readonly<Partial<Record<NoticeCode, readonly string[]>>> = {
  typical_short: ['short'],
  month_heading_short: ['short', 'largest'],
  unspent_drifted: ['suggested'],
  income_from_expected: ['amount'],
  pay_capped_expected: ['capped'],
  same_season_compared: ['everyday'],
  income_volatile: ['payment', 'monthly', 'leanLeft'],
  unexplained_money: ['amount'],
  pay_not_seen: ['amount'],
  pay_counted_missed: ['amount'],
  fund_account_unknown: ['amount'],
};

/** Values that are a YearMonth (written as the month's name) or an ISO date (written as the user's date). */
const MONTH_KEYS: readonly string[] = ['month', 'sameMonth', 'lastYear', 'leanFrom', 'leanTo'];
const DATE_KEYS: readonly string[] = ['date'];

const TILE_PAD_V = 10;
const TILE_PAD_H = 14;
const TILE_RADIUS = 16;

export interface NoticeTilesProps {
  notices: readonly Notice[];
}

export function NoticeTiles({ notices }: NoticeTilesProps): React.JSX.Element | null {
  const t = useT() as (key: string, params?: Record<string, string>) => string;
  const fmt = useV3Format();
  const { colors, pairing } = useTheme();
  if (notices.length === 0) return null;
  return (
    <View style={styles.list}>
      {notices.map((n, i) => {
        const picked = noticeCopy(n);
        const written: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(picked.params)) {
          if (typeof v === 'string' && MONTH_KEYS.includes(k)) written[k] = fmt.month(v);
          else if (typeof v === 'string' && DATE_KEYS.includes(k)) written[k] = fmt.date(v);
          else written[k] = v;
        }
        const { screen, a11y } = fmt.flat(written, MONEY_KEYS[n.code] ?? []);
        return (
          <View
            key={`${n.code}-${i}`}
            accessible
            accessibilityLabel={t(picked.key, a11y)}
            style={[styles.tile, { backgroundColor: colors.fill2 }]}
          >
            <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.s13_5, color: colors.ink }}>{t(picked.key, screen)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.gapSm },
  tile: { borderRadius: TILE_RADIUS, paddingVertical: TILE_PAD_V, paddingHorizontal: TILE_PAD_H },
});
