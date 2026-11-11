// 06.1-14 (CO-D-64 (4), CO-D-119, CO-D-118, CMP-F02, audit F2): the legal block under every answer. In order: the basis sentence, the first
// caveat only (or the large_for_month figure list then the wrong-figure line), the caveat line, the cant-see link, the footer.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import type { Line } from '../logic/sayResult';

export interface LegalBlockProps {
  basis: Line | null;
  caveat: Line | null;
  /** large_for_month: one line per figure, then the wrong-figure line (CO-D-118). Empty for any other caveat. */
  caveatFigures: readonly Line[];
  onCantSee: () => void;
}

export function LegalBlock({ basis, caveat, caveatFigures, onCantSee }: LegalBlockProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const body = { ...textRole(pairing, 'body'), color: colors.inkDim };
  return (
    <View testID="answer-legal" style={styles.block}>
      {basis !== null ? (
        <Text testID="answer-basis" style={body}>
          {basis.text}
        </Text>
      ) : null}
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
      <Pressable testID="answer-cant-see" accessibilityRole="button" onPress={onCantSee} style={styles.link}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('legal.decideAnswer.cantSeeLink')}</Text>
      </Pressable>
      <Text testID="answer-footer" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
        {t('legal.decideAnswer.footer')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
