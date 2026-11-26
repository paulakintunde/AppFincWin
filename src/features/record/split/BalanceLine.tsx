// 10.1-18 (SPL-02, D-02): "Adds up" / "{amount} left to place" / "{amount} over". Glyph plus word plus colour, a polite live
// region that speaks once the figures stop moving (useSettledLabel, 600 ms), and a soft cross-fade when the state changes.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { StateBadge, type StateBadgeShape, type StateBadgeTone } from '@/ui/StateBadge';
import { FadeSwap } from '@/ui/motion/FadeSwap';
import { useSettledLabel } from '@/ui/useSettledLabel';
import { useT } from '@/i18n';
import { radii } from '@/theme/layout';
import { stateColors } from '@/theme/tokens';
import type { Balance } from '@/engine/parts';

export interface BalanceLineProps {
  balance: Balance;
  /** Formats minor units in the line's currency. */
  money: (minor: number) => string;
  /** D-03: the sheet opened to place a gap, so the line is outlined. */
  highlight?: boolean;
}

const TONE: Record<Balance['state'], { tone: StateBadgeTone; shape: StateBadgeShape }> = {
  addsUp: { tone: 'fits', shape: 'sCheck' },
  left: { tone: 'tight', shape: 'sHalf' },
  over: { tone: 'short', shape: 'sOver' },
};

export function BalanceLine({ balance, money, highlight = false }: BalanceLineProps) {
  const t = useT();
  const words =
    balance.state === 'addsUp'
      ? t('split.balance.addsUp')
      : balance.state === 'left'
        ? t('split.balance.left', { amount: money(balance.amount) })
        : t('split.balance.over', { amount: money(balance.amount) });
  const spoken = useSettledLabel(words, balance.state, 600);
  const { tone, shape } = TONE[balance.state];
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={spoken}
      testID="split-balance"
      style={[styles.line, highlight ? { ...styles.outlined, borderColor: stateColors.tight.stroke } : null]}
    >
      <FadeSwap value={balance.state}>
        <StateBadge tone={tone} shape={shape} label={words} testID={`split-balance-${balance.state}`} />
      </FadeSwap>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { alignSelf: 'flex-end' },
  outlined: { borderWidth: 1.5, borderRadius: radii.pill },
});
