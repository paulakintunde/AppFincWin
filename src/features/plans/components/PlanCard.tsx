// 09-14: one plan on the paywall (UI-SPEC section 5): a radio card with an accent ring when selected. The state colours
// never touch a price. Prices come from the model (store strings), never from this file.
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tOneOf } from '@/i18n';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { shadows } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { hapticTick } from '@/ui/haptics';
import { RadioDot } from '@/ui/RadioDot';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { Text } from '@/ui/Text';
import { formatPlanDate } from '../formatPlanDate';
import { metaRole } from './metaRole';
import type { PlanCardModel } from '../plansModel';

const FONT_SCALE_DROP = 1.3;

export function PlanCard({ card, loading, onPress }: { card: PlanCardModel; loading: boolean; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const { colors, pairing } = useTheme();
  const { fontScale } = useWindowDimensions();
  const big = fontScale > FONT_SCALE_DROP;

  const name = t(card.nameKey);
  const people = t(card.peopleKey);
  const main = card.priceMain ? tOneOf(t, card.priceMain.key, { price: card.priceMain.price }) : loading ? t('plans.paywall.states.loadingPrice') : '';
  const other = card.priceOther ? tOneOf(t, card.priceOther.key, { price: card.priceOther.price }) : '';
  const chip = card.chip ? t('plans.paywall.chipTrial') : card.noTrial ? t('plans.paywall.noTrial') : '';
  const changeLine = card.changeLine ? tOneOf(t, card.changeLine.key, { date: formatPlanDate(card.changeLine.date, i18n.language) }) : '';
  const a11y = [name, people, main, other, chip, card.current ? t('plans.paywall.currentBadge') : ''].filter(Boolean).join(', ');

  return (
    <Pressable
      testID={`plan-card-${card.planKey}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: card.selected }}
      accessibilityLabel={a11y}
      onPress={() => {
        hapticTick();
        onPress();
      }}
      style={({ pressed }) => [
        styles.card,
        shadows.card,
        { backgroundColor: loading ? colors.fill1 : colors.surface, borderColor: card.selected ? colors.accent : 'transparent', opacity: pressed ? PRESSED_OPACITY : 1 },
      ]}
    >
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{name}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{people}</Text>
        </View>
        <RadioDot selected={card.selected} />
      </View>
      {card.current ? <StatusBadge status="planActive" /> : null}
      <View style={styles.prices}>
        <Text scale="capped" style={{ ...textRole(pairing, big ? 'sheetTitle' : 'heading'), color: colors.ink, fontVariant: ['tabular-nums'] }}>
          {main}
        </Text>
        {other ? <Text style={{ ...metaRole(pairing), color: colors.inkMuted, fontVariant: ['tabular-nums'] }}>{other}</Text> : null}
      </View>
      {card.chip ? (
        <View style={[styles.chip, { backgroundColor: colors.fill1 }]}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('plans.paywall.chipTrial')}</Text>
        </View>
      ) : card.noTrial ? (
        <Text style={{ ...metaRole(pairing), color: colors.inkMuted }}>{t('plans.paywall.noTrial')}</Text>
      ) : null}
      <Text style={{ ...metaRole(pairing), color: colors.inkMuted }}>{t('plans.paywall.chargedInFull')}</Text>
      {changeLine ? <Text style={{ ...metaRole(pairing), color: colors.inkMuted }}>{changeLine}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 64, borderRadius: radii.card, borderWidth: 2, padding: space.cardPad, gap: space.gapSm },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.gapMd },
  headText: { flexShrink: 1, gap: 4 },
  prices: { gap: space.gapSm },
  chip: { alignSelf: 'flex-start', minHeight: 28, paddingHorizontal: space.gapMd, borderRadius: radii.pill, justifyContent: 'center' },
});
