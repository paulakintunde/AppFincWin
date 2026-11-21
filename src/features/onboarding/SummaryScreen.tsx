// 09-21 UI-SPEC 2b: "Here is your FincWin". A surface card of LabelValueRows (Skipped in inkMuted where unanswered), then a fill1
// level card ("Everyday · 27 of 44 features on") with the level sentence. First run: Continue. Re-run: Apply these and
// "Keep what I have", with the line that features holding records stay on.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { money } from '@/engine/money';
import { FEATURES, type Level } from '@/features/levels/featureRegistry';
import type { OnboardingAnswers } from '@/features/levels/onboardingAnswers';
import { LabelValueRow } from '@/ui/LabelValueRow';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { optionTitleKey, type OptionQuestionKey } from './questions/optionTables';
import { useCopy } from './useCopy';
import { featuresOn, type OnboardingMode } from './useOnboardingFlow';

const LEVEL_KEY: Record<Level, string> = { 1: 'basics', 2: 'everyday', 3: 'fullPicture', 4: 'everything' };

export interface SummaryScreenProps {
  mode: OnboardingMode;
  answers: OnboardingAnswers;
  level: Level;
  /** Feature id to on/off overrides the level starts from. */
  switches: Readonly<Record<string, boolean>>;
  homeCurrency: string;
  onContinue: () => void;
  onApply: () => void;
  onKeep: () => void;
  onSeeWhatIsOn: () => void;
}

const ROWS = ['goal', 'cur', 'acct', 'inc', 'debt', 'inv', 'share', 'watch', 'save'] as const;
type RowKey = (typeof ROWS)[number];

export function SummaryScreen({ mode, answers, level, switches, homeCurrency, onContinue, onApply, onKeep, onSeeWhatIsOn }: SummaryScreenProps) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const fmt = useMoneyFormatter(false, homeCurrency);
  const rerun = mode === 'rerun';
  const currency = answers.cur ?? homeCurrency;

  const valueOf = (key: RowKey): string | null => {
    switch (key) {
      case 'goal':
      case 'debt':
      case 'inv':
      case 'share':
      case 'watch': {
        const titleKey = optionTitleKey(key as OptionQuestionKey, answers);
        return titleKey === null ? null : t(titleKey);
      }
      case 'cur':
        return answers.cur ?? null;
      case 'acct':
        return answers.acct?.name ?? null;
      case 'inc':
        return answers.inc ? fmt.formatMoney(money(answers.inc.amountMinor, currency)) : null;
      case 'save':
        return answers.save?.name ?? null;
    }
  };

  const levelName = t(`features.levels.${LEVEL_KEY[level]}.name`);
  const levelSentence = t(`features.levels.${LEVEL_KEY[level]}.sentence`);
  const levelLine = t('onboarding.summary.levelLine', {
    level: levelName,
    count: featuresOn(level, switches),
    total: FEATURES.length,
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('onboarding.summary.heading')}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {ROWS.map((key) => {
            const value = valueOf(key);
            return (
              <LabelValueRow
                key={key}
                label={t(`onboarding.summary.row.${key}`)}
                value={value ?? t('onboarding.summary.skipped')}
                valueTone={value === null ? 'muted' : 'ink'}
                valueLines={2}
              />
            );
          })}
        </View>
        <View testID="onb-level-card" style={[styles.card, { backgroundColor: colors.fill1 }]}>
          <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{levelLine}</Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{levelSentence}</Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('onboarding.summary.restStays')}</Text>
          {rerun ? (
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('onboarding.summary.recordsStayOn')}</Text>
          ) : null}
        </View>
        <Pressable
          testID="onb-see-features"
          accessibilityRole="link"
          accessibilityLabel={t('onboarding.summary.seeWhatIsOn')}
          hitSlop={LINK_HIT_SLOP}
          onPress={onSeeWhatIsOn}
          style={styles.link}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('onboarding.summary.seeWhatIsOn')}</Text>
        </Pressable>
      </ScrollView>
      <View style={styles.footer}>
        <Pill
          label={t(rerun ? 'onboarding.summary.apply' : 'onboarding.summary.continue')}
          variant="primary"
          onPress={rerun ? onApply : onContinue}
        />
        {rerun ? (
          <Pressable testID="onb-keep" accessibilityRole="link" accessibilityLabel={t('onboarding.summary.keep')} hitSlop={LINK_HIT_SLOP} onPress={onKeep} style={styles.linkCenter}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('onboarding.summary.keep')}</Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: space.groupGap, paddingVertical: space.groupGap },
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  link: { minHeight: 44, justifyContent: 'center' },
  linkCenter: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  footer: { gap: space.gapSm, paddingTop: space.gapMd },
});
