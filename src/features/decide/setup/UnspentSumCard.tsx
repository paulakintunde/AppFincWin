/**
 * Plan 05.2-28 (UI-SPEC "Unspent money sheet"): the worked sum, shared by the Unspent step and the Unspent sheet. A
 * surface card (radius 26, cardPadLg): one 44-high line per UnspentLine, label left (wraps) and figure right (never
 * breaks), a 2px ink rule, then "Unspent money" and the total (heading, accent; danger with a "−" when negative).
 * Under the card, the notes about accounts not counted and envelopes not placed. Below 360 dp or above 1.3x text the
 * figure drops under its label.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useShouldStack } from '@/features/decide/ui/textFit';
import { Meta, TextButton, useCopy, useNoWrapMoney } from '@/features/income/steps/shared';
import type { UnspentLineKey, UnspentSumLines } from './unspentView';

const LINE_KEY: Record<UnspentLineKey, string> = {
  balance: 'decide.unspentSheet.lineBank',
  mixedSetAside: 'decide.unspentSheet.lineMixed',
  billsDue: 'decide.unspentSheet.lineBills',
  everydayLeft: 'decide.unspentSheet.lineEveryday',
  envelopes: 'decide.unspentSheet.lineEnvelopes',
  emergency: 'decide.unspentSheet.lineEmergency',
  heldBack: 'decide.unspentSheet.lineHeld',
};

const RULE = 2;
const MINUS = '−';

export interface UnspentSumCardProps {
  lines: UnspentSumLines;
  currency: string;
  /** Opens the account-use step in edit mode. Without it the "Set them" button is not drawn. */
  onSetThem?: () => void;
}

export function UnspentSumCard({ lines, currency, onSetThem }: UnspentSumCardProps) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const money = useNoWrapMoney(currency);
  const stacked = useShouldStack();
  const negative = lines.total < 0;
  const totalText = negative ? `${MINUS}${money(-lines.total)}` : money(lines.total);

  const rowStyle = stacked ? styles.rowStacked : styles.row;

  return (
    <View style={{ gap: space.gapMd }}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {lines.lines.map((line) => (
          <View
            key={line.key}
            accessible
            accessibilityLabel={`${t(LINE_KEY[line.key])}, ${money(line.amount)}`}
            style={[rowStyle, styles.line, { borderBottomColor: colors.line1 }]}
          >
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flex: stacked ? undefined : 1, flexShrink: 1 }}>{t(LINE_KEY[line.key])}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 0 }}>
              {money(line.amount)}
            </Text>
          </View>
        ))}
        <View style={[styles.rule, { backgroundColor: colors.ink }]} />
        <View accessible accessibilityLabel={`${t('decide.unspentSheet.total')}, ${totalText}`} style={[rowStyle, styles.total]}>
          <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, flex: stacked ? undefined : 1, flexShrink: 1 }}>
            {t('decide.unspentSheet.total')}
          </Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ ...textRole(pairing, 'heading'), color: negative ? colors.danger : colors.accent, flexShrink: 0 }}>
            {totalText}
          </Text>
        </View>
      </View>
      {lines.unstatedAccounts > 0 ? (
        <View style={{ gap: 0 }}>
          <Meta text={t('decide.unspentSheet.notCounted', { count: lines.unstatedAccounts })} />
          {onSetThem ? <TextButton label={t('decide.unspentSheet.setThem')} onPress={onSetThem} /> : null}
        </View>
      ) : null}
      {lines.hasMixed && lines.unplacedEnvelopes > 0 ? <Meta text={t('decide.unspentSheet.unplaced', { count: lines.unplacedEnvelopes })} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPadLg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  rowStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 2 },
  line: { minHeight: space.touchMin, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  rule: { height: RULE, marginTop: space.gapSm },
  total: { minHeight: space.touchMin, paddingTop: space.gapSm },
});
