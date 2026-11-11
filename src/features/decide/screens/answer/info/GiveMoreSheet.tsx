// 06.1-35 (N03, CMP-F12): "Give it more to go on". At most one next step, the readiness lines, and each missing figure as a link.
// Takes the already-said lines (useSaid), so no sentence is built here. Never claims the answer is sure or surer.
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import type { Line } from '../../logic/sayResult';
import { Block, Body, InfoSheet, SectionTitle } from './infoUi';

export interface GiveMoreSheetProps {
  nextStep: Line | null;
  readiness: readonly Line[];
  /** Each line's `code` is the MissingCode, so the owner can open the place that sets it. */
  missing: readonly Line[];
  /** The step is waiting for a month to finish: the date to offer a reminder for. Otherwise null. */
  remindOn?: string | null;
  onOpenMissing: (code: string) => void;
  onRemind?: (date: string) => void;
  onClose: () => void;
}

export function GiveMoreSheet({ nextStep, readiness, missing, remindOn = null, onOpenMissing, onRemind, onClose }: GiveMoreSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { formatDate } = useMoneyFormatter(true);
  const nothing = nextStep === null && readiness.length === 0 && missing.length === 0;
  const link = { ...textRole(pairing, 'label'), color: colors.accent };
  return (
    <InfoSheet title={t('decide.screens.answer.giveMore.title')} onClose={onClose}>
      <Body muted>{t('decide.screens.answer.giveMore.sub')}</Body>
      {nothing ? <Body testID="give-more-none">{t('decide.screens.answer.giveMore.none')}</Body> : null}
      {nextStep !== null ? (
        <Block>
          <SectionTitle>{t('decide.screens.answer.giveMore.nextTitle')}</SectionTitle>
          <Body testID="give-more-next">{nextStep.text}</Body>
          {remindOn !== null && onRemind !== undefined ? (
            <Pressable testID="give-more-remind" accessibilityRole="button" onPress={() => onRemind(remindOn)} style={styles.link}>
              <Text style={link}>{t('decide.screens.answer.giveMore.remind', { date: formatDate(remindOn) })}</Text>
            </Pressable>
          ) : null}
        </Block>
      ) : null}
      {readiness.length > 0 ? (
        <Block>
          <SectionTitle>{t('decide.screens.answer.giveMore.readinessTitle')}</SectionTitle>
          {readiness.map((l, i) => (
            <Body key={`${l.key}-${i}`} testID="give-more-readiness">
              {l.text}
            </Body>
          ))}
        </Block>
      ) : null}
      {missing.length > 0 ? (
        <Block>
          <SectionTitle>{t('decide.screens.answer.giveMore.missingTitle')}</SectionTitle>
          {missing.map((l, i) => (
            <Pressable key={`${l.key}-${i}`} testID="give-more-missing" accessibilityRole="link" accessibilityLabel={l.text} onPress={() => onOpenMissing(l.code)} style={styles.link}>
              <Text style={link}>{l.text}</Text>
            </Pressable>
          ))}
        </Block>
      ) : null}
    </InfoSheet>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
