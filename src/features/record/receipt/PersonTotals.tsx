// 10.1-27 (SCN-06; D-15; UI-SPEC 6): "Each person's share", the focal card of a split by item. One row per member with the
// avatar, the name, the total and "{items} items · {extras} tax, tip and discounts"; a member with no items shows "Nothing" and
// "No items". The bottom line is "Total {amount}" with the balance badge (glyph + word + colour). The totals line is a polite
// live region that speaks every share and the balance once the figures stop moving (useSettledLabel, 600 ms).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Row } from '@/ui/Row';
import { StateBadge, type StateBadgeShape, type StateBadgeTone } from '@/ui/StateBadge';
import { useSettledLabel } from '@/ui/useSettledLabel';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { PersonShare } from '@/engine/receipt';
import { MemberAvatar } from '@/features/household/components/MemberAvatar';
import type { ReviewMember } from './scanModel';

export interface PersonTotalsProps {
  householdId: string | null;
  members: readonly ReviewMember[];
  /** From sharesPreview; empty while an item has nobody (cannot happen through the chips). */
  shares: readonly PersonShare[];
  /** The line total the shares must come to (positive minor units). */
  total: number;
  /** Minor units as shown ("$24.50") and as spoken ("24 dollars 50"). */
  money(minor: number): string;
  spoken(minor: number): string;
}

const BADGE: Record<'addsUp' | 'left' | 'over', { tone: StateBadgeTone; shape: StateBadgeShape }> = {
  addsUp: { tone: 'fits', shape: 'sCheck' },
  left: { tone: 'tight', shape: 'sHalf' },
  over: { tone: 'short', shape: 'sOver' },
};

const signed = (minor: number, fmt: (m: number) => string) => (minor < 0 ? `-${fmt(-minor)}` : fmt(minor));

export function PersonTotals({ householdId, members, shares, total, money, spoken }: PersonTotalsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const byId = new Map(shares.map((s) => [s.memberId, s] as const));
  const sum = shares.reduce((s, p) => s + p.total, 0);
  const state: keyof typeof BADGE = sum === total ? 'addsUp' : sum < total ? 'left' : 'over';
  const words =
    state === 'addsUp'
      ? t('split.balance.addsUp')
      : t(state === 'left' ? 'split.balance.left' : 'split.balance.over', { amount: money(Math.abs(total - sum)) });

  const nothing = t('scan.byItem.nothing');
  const sentence = members
    .map((m) => {
      const share = byId.get(m.id);
      return t('scan.byItem.shareA11y', { name: m.name, amount: share && share.itemCount > 0 ? signed(share.total, spoken) : nothing });
    })
    .join(', ');
  const summary = `${sentence}. ${words}`;
  const settled = useSettledLabel(summary, state, 600);

  return (
    <View style={[styles.card, { backgroundColor: colors.fill1 }]} testID="person-totals">
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, paddingTop: step.row }}>
        {t('scan.byItem.shares')}
      </Text>
      {members.map((m, i) => {
        const share = byId.get(m.id);
        const has = share !== undefined && share.itemCount > 0;
        const amount = has ? signed(share.total, money) : nothing;
        const sub = has
          ? t('scan.byItem.shareSub', { count: share.itemCount, extras: signed(share.extras, money) })
          : t('scan.byItem.noItems');
        return (
          <View
            key={m.id}
            accessible
            accessibilityLabel={t('scan.byItem.personA11y', { name: m.name, amount: has ? signed(share.total, spoken) : nothing, count: has ? share.itemCount : 0 })}
            style={i === 0 ? null : [styles.rule, { borderTopColor: colors.line1 }]}
            testID={`person-total-${m.id}`}
          >
            <Row
              label={m.name}
              emphasis
              leading={<MemberAvatar householdId={householdId} userId={m.id} size={36} />}
              amount={amount}
              sublabel={sub}
            />
          </View>
        );
      })}
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={settled}
        style={[styles.total, styles.rule, { borderTopColor: colors.line1 }]}
        testID="person-totals-total"
      >
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink, flexShrink: 1 }}>{t('split.detail.total', { amount: money(total) })}</Text>
        <StateBadge tone={BADGE[state].tone} shape={BADGE[state].shape} label={words} testID={`person-totals-${state}`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, paddingHorizontal: step.card },
  rule: { borderTopWidth: 1 },
  total: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: step.tight, paddingVertical: step.row },
});
