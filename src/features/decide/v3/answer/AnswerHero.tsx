/**
 * 05.3-25 (UI-SPEC Hero, Answer tones). The tinted answer card: a surface chip in the tone colour, the catalogue title and
 * body. The title and body are one polite live region whose label ("{chip}. {title} {body}") settles after ~150 ms of no
 * change, or updates at once when the chip changes (useSettledLabel). The chip pill itself is hidden from assistive tech
 * because its words are the start of that label. `extraChip` (the confidence chip, a button) sits beside the chip, outside
 * the live region so it keeps its own focus stop. One warning haptic when a not_yet, monthly_short or emergency_use answer
 * first appears or its code changes (heroHaptic); none for fits or needs_input, none while typing.
 * `busy` keeps the previous text on screen and marks the group busy: a recompute never blanks the hero.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Code, Evaluation } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { warnTint } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { hapticWarning } from '@/ui/haptics';
import { Text } from '@/ui/Text';
import { heroHaptic, heroModel } from '../model/hero';
import { useSettledLabel } from '../shared/useSettledLabel';
import { useV3Format } from '../shared/useV3Format';

const SETTLE_MS = 150;
const HERO_RADIUS = 26;
const HERO_GAP = 10;
const CHIP_PAD_V = 4;
const CHIP_PAD_H = 12;
const TITLE_CAP = 1.3;

export interface AnswerHeroProps {
  evaluation: Evaluation;
  busy?: boolean;
  extraChip?: React.ReactNode;
}

interface Shown {
  readonly code: Code;
  readonly tone: 'fits' | 'caution' | 'short' | 'input';
  readonly chip: string;
  readonly title: string;
  readonly body: string;
  readonly spoken: string;
}

export function AnswerHero({ evaluation, busy = false, extraChip }: AnswerHeroProps): React.JSX.Element {
  const t = useT() as (key: string, params?: Record<string, string>) => string;
  const fmt = useV3Format();
  const { colors, pairing } = useTheme();

  const current = useMemo<Shown>(() => {
    const m = heroModel(evaluation);
    const { screen, a11y } = fmt.params(m.params);
    const chip = t(m.chipKey);
    const title = t(m.titleKey, screen);
    const body = t(m.bodyKey, screen);
    const spoken = t('decide.v3.ui.answer.heroA11y', {
      chip,
      title: t(m.titleKey, a11y),
      body: t(m.bodyKey, a11y),
    });
    return { code: evaluation.result.code, tone: m.tone, chip, title, body, spoken };
  }, [evaluation, fmt, t]);

  // busy: keep what was on screen. The first render has nothing to keep, so it shows what it has.
  const last = useRef<Shown>(current);
  if (!busy) last.current = current;
  const shown = last.current;

  const label = useSettledLabel(shown.spoken, shown.chip, SETTLE_MS);

  const prevCode = useRef<Code | undefined>(undefined);
  useEffect(() => {
    if (heroHaptic(prevCode.current, shown.code) === 'warning') hapticWarning();
    prevCode.current = shown.code;
  }, [shown.code]);

  let fill: string = colors.fill2;
  let chipColor: string = colors.inkDim;
  if (shown.tone === 'fits') {
    fill = shown.code === 'fits_unspent' ? colors.fill1 : colors.accentTint1;
    chipColor = colors.accent;
  } else if (shown.tone === 'caution') {
    fill = warnTint;
    chipColor = colors.warn1;
  } else if (shown.tone === 'short') {
    fill = colors.dangerTint1;
    chipColor = colors.danger;
  }

  return (
    <View style={[styles.card, { backgroundColor: fill }]}>
      <View style={styles.chipRow}>
        <View
          style={[styles.chip, { backgroundColor: colors.surface }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text scale="capped" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: chipColor }}>
            {shown.chip}
          </Text>
        </View>
        {extraChip}
      </View>
      <View
        accessible
        accessibilityLabel={label}
        accessibilityLiveRegion="polite"
        accessibilityState={{ busy }}
        style={styles.group}
      >
        <Text
          accessibilityRole="header"
          scale="capped"
          maxFontSizeMultiplier={TITLE_CAP}
          style={{ ...textRole(pairing, 'heading'), color: colors.ink }}
        >
          {shown.title}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{shown.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: HERO_RADIUS, padding: space.cardPadLg, gap: HERO_GAP },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.gapSm },
  chip: { alignSelf: 'flex-start', paddingHorizontal: CHIP_PAD_H, paddingVertical: CHIP_PAD_V, borderRadius: radii.pill },
  group: { gap: HERO_GAP },
});
