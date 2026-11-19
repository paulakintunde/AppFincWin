// 09-15 (UI-SPEC section 6): the plan name with its status badge, then the label/value rows. A `surface` card on
// `shadows.card`. Values are copy keys with params from subscriptionModel; this component only draws them.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';
import { tOneOf } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { shadows } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { LabelValueRow } from '@/ui/LabelValueRow';
import { Text } from '@/ui/Text';
import { StatusBadge } from '@/ui/status/StatusBadge';
import type { StatusKey } from '@/ui/status/statusMap';
import { PlanLink } from './NoticeCard';
import type { SubscriptionRow } from '../subscriptionModel';

export interface PlanStatusCardProps {
  title: string;
  badge: StatusKey | null;
  rows: SubscriptionRow[];
  note?: string | null;
  onSeeMembers?: () => void;
}

export function PlanStatusCard({ title, badge, rows, note, onSeeMembers }: PlanStatusCardProps) {
  const { t } = useTranslation();
  const { colors, pairing } = useTheme();
  const value = (row: SubscriptionRow): string =>
    row.valueKey ? tOneOf(t, row.valueKey as ParseKeys<'common'>, row.params) : (row.raw ?? '');
  return (
    <View testID="plan-status-card" style={[styles.card, shadows.card, { backgroundColor: colors.surface }]}>
      <View style={styles.head}>
        {title ? (
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, flexShrink: 1 }}>
            {title}
          </Text>
        ) : null}
        {badge ? <StatusBadge status={badge} /> : null}
      </View>
      {rows.map((row) =>
        row.fullLine ? (
          <Text key={row.id} style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {value(row)}
          </Text>
        ) : (
          <View key={row.id}>
            <LabelValueRow label={tOneOf(t, row.labelKey as ParseKeys<'common'>)} value={value(row)} />
            {row.seeMembers && onSeeMembers ? <PlanLink label={t('plans.subscription.row.seeMembers')} onPress={onSeeMembers} /> : null}
          </View>
        ),
      )}
      {note ? <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd, flexWrap: 'wrap' },
});
