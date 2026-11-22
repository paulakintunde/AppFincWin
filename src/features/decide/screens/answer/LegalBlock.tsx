// 06.1-14 (CO-D-64 (4), CO-D-119, CO-D-118, CMP-F02, audit F2): the legal block under every answer. In order: the basis sentence, the pay-window row and StageLine (08.1-20), the first
// caveat only (or the large_for_month figure list then the wrong-figure line), the caveat line, the cant-see link, the footer.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { LINK_HIT_SLOP, usePressFeedback } from '@/ui/pressFeedback';
import { TesterBuildLine } from './TesterBuildLine';
import type { Line } from '../logic/sayResult';

export interface LegalBlockProps {
  basis: Line | null;
  /** 08.1-20: "Pay is judged over your last {{months}} months." after the basis, for pay judged over more than 6 months. */
  payWindow?: Line | null;
  /** 08.1-20: the StageLine (stages 1 and 2 only), after the pay-window row and before the first caveat. */
  stageLine?: React.ReactNode;
  caveat: Line | null;
  /** large_for_month: one line per figure, then the wrong-figure line (CO-D-118). Empty for any other caveat. */
  caveatFigures: readonly Line[];
  onCantSee: () => void;
}

export function LegalBlock({ basis, payWindow = null, stageLine = null, caveat, caveatFigures, onCantSee }: LegalBlockProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  // 06.1-62 (CB-5 / CB-6): links show a press at once and reach 52 dp tall.
  const press = usePressFeedback('row');
  const body = { ...textRole(pairing, 'body'), color: colors.inkDim };
  return (
    <View testID="answer-legal" style={styles.block}>
      {basis !== null ? (
        <Text testID="answer-basis" style={body}>
          {basis.text}
        </Text>
      ) : null}
      {payWindow !== null ? (
        <Text testID="answer-pay-window" style={body}>
          {payWindow.text}
        </Text>
      ) : null}
      {stageLine}
      {caveat !== null ? (
        <View testID="answer-caveat" style={styles.block}>
          <Text style={body}>{caveat.text}</Text>
          {caveatFigures.map((f, i) => (
            <Text key={`${f.key}-${i}`} testID="answer-caveat-figure" style={body}>
              {f.text}
            </Text>
          ))}
        </View>
      ) : null}
      <Text testID="answer-caveat-line" style={body}>
        {t('legal.decideAnswer.caveat')}
      </Text>
      <Pressable testID="answer-cant-see" accessibilityRole="button" onPress={onCantSee} hitSlop={LINK_HIT_SLOP} android_ripple={press.android_ripple} style={({ pressed }) => [styles.link, press.pressedStyle(pressed)]}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('legal.decideAnswer.cantSeeLink')}</Text>
      </Pressable>
      <Text testID="answer-footer" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
        {t('legal.decideAnswer.footer')}
      </Text>
      <TesterBuildLine />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
