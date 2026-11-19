// 09-14: the one disclosure block (D-22, Apple 3.1.2(c)), used on Plans and Subscription so the wording cannot drift.
// Always visible, never collapsed. inkMuted on fill1 (tested pair); no inkFaint.
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';
import { tOneOf } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { Text } from '@/ui/Text';
import { formatPlanDate } from '../formatPlanDate';
import { metaRole } from './metaRole';
import { PRIVACY_URL, TERMS_URL } from '../legalLinks';
import type { DisclosureLine } from '../plansModel';

export function DisclosureBlock({ lines }: { lines: DisclosureLine[] }) {
  const { t, i18n } = useTranslation();
  const { colors, pairing } = useTheme();
  const meta = { ...metaRole(pairing), color: colors.inkMuted };
  const link = { ...metaRole(pairing), color: colors.accent };
  return (
    <View testID="disclosure-block" style={[styles.card, { backgroundColor: colors.fill1 }]}>
      {lines.map((line) => {
        const params = line.params ? { ...line.params, ...(line.params.date ? { date: formatPlanDate(line.params.date, i18n.language) } : {}) } : undefined;
        return (
          <Text key={line.key} style={meta}>
            {tOneOf(t, line.key as ParseKeys<'common'>, params)}
          </Text>
        );
      })}
      <View style={styles.links}>
        <Pressable accessibilityRole="link" hitSlop={LINK_HIT_SLOP} style={styles.link} onPress={() => void Linking.openURL(TERMS_URL)}>
          <Text style={link}>{t('plans.paywall.terms')}</Text>
        </Pressable>
        <Pressable accessibilityRole="link" hitSlop={LINK_HIT_SLOP} style={styles.link} onPress={() => void Linking.openURL(PRIVACY_URL)}>
          <Text style={link}>{t('plans.paywall.privacy')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.groupGap },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
