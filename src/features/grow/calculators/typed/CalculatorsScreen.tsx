// 06-13 GC01: the Calculators page. Four calculators that work from typed numbers, no records needed (D-21).
// The "With your records" section is filled in by the Grow screens (06-18, 06-19) through `recordLinks`; empty, it is not drawn.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useT } from '@/i18n';
import { GrowGlyph, type GrowGlyphName } from '@/features/grow/ui/GrowGlyph';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Row } from '@/ui/Row';
import { Text } from '@/ui/Text';
import { FooterNote } from './CalcFields';

export interface RecordLink {
  key: string;
  glyph: GrowGlyphName;
  label: string;
  sublabel?: string;
  onPress: () => void;
}

export interface CalculatorsScreenProps {
  recordLinks?: readonly RecordLink[];
}

const CALCULATORS: readonly { key: string; glyph: GrowGlyphName; title: string; sub: string; href: Href }[] = [
  { key: 'loan', glyph: 'bills', title: 'grow.calc.page.loan', sub: 'grow.calc.page.loanSub', href: '/grow/calculators/loan' as Href },
  { key: 'savings', glyph: 'savings', title: 'grow.calc.page.savings', sub: 'grow.calc.page.savingsSub', href: '/grow/calculators/savings' as Href },
  { key: 'growth', glyph: 'invest', title: 'grow.calc.page.compound', sub: 'grow.calc.page.compoundSub', href: '/grow/calculators/growth' as Href },
  { key: 'payoff', glyph: 'debt', title: 'grow.calc.page.debt', sub: 'grow.calc.page.debtSub', href: '/grow/calculators/payoff' as Href },
] as const;

const NO_LINKS: readonly RecordLink[] = [];

export function CalculatorsScreen({ recordLinks = NO_LINKS }: CalculatorsScreenProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const cardStyle = [styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }];
  return (
    <DetailScreen title={t('grow.calc.page.title')}>
      <View style={styles.page}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('grow.calc.page.subtitle')}</Text>
        <View style={cardStyle}>
          {CALCULATORS.map((c) => (
            <Row
              key={c.key}
              leading={<GrowGlyph name={c.glyph} color={colors.accent} size={22} />}
              label={t(c.title as 'grow.calc.page.loan')}
              sublabel={t(c.sub as 'grow.calc.page.loanSub')}
              chevron
              onPress={() => router.push(c.href)}
            />
          ))}
        </View>
        {recordLinks.length > 0 ? (
          <>
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }}>
              {t('grow.calc.page.records')}
            </Text>
            <View style={cardStyle}>
              {recordLinks.map((l) => (
                <Row
                  key={l.key}
                  leading={<GrowGlyph name={l.glyph} color={colors.accent} size={22} />}
                  label={l.label}
                  sublabel={l.sublabel}
                  chevron
                  onPress={l.onPress}
                />
              ))}
            </View>
          </>
        ) : null}
        <FooterNote text={t('grow.calc.page.footer')} />
      </View>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.gapMd, paddingTop: space.gapSm },
  card: { borderWidth: 1, borderRadius: radii.card, paddingHorizontal: space.cardPad },
});
