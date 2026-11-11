// 06.1-14 (D-16, D-17, D-18, UX-09): the verdict card. The engine's chip, title and body keys say what the answer is; the state
// colour, glyph and word come from stateForVerdict. The tint sits on the card only, never on the screen (rule 1).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { verdictRowFor, type Code, type Variant } from '@/engine/decide/v3';
import { radii, space } from '@/theme/layout';
import { DURATION } from '@/theme/motion';
import { useFontScale } from '@/theme/FontScaleProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { stateColors, stateMuted } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { RiseIn } from '@/ui/RiseIn';
import { StateBadge, type StateBadgeShape } from '@/ui/StateBadge';
import { Text } from '@/ui/Text';
import { stateForVerdict } from '../logic/stateForVerdict';

/** Above this text scale the title drops from heading to sheetTitle so a long title still fits (UX-02). */
export const TITLE_DROP_SCALE = 1.3;

export interface VerdictCardProps {
  code: Code;
  variant: Variant | null;
  /** The check is paid once (or a short plan judged by cash): picks the one-off "tight" rows (verdictRowFor). */
  once: boolean;
  /** The after-buy sentence the answer leads with. */
  lead?: string | null;
  boughtOn?: string | null;
  testID?: string;
}

export function VerdictCard({ code, variant, once, lead = null, boughtOn = null, testID = 'answer-verdict' }: VerdictCardProps) {
  const { t } = useTranslation();
  const { pairing } = useTheme();
  const fontScale = useFontScale();
  const row = verdictRowFor(code, variant, once);
  const { tone, glyph } = stateForVerdict(code, variant);
  const state = stateColors[tone];
  const titleRole = fontScale > TITLE_DROP_SCALE ? 'sheetTitle' : 'heading';
  const chip = t(row.chipKey as never);
  const title = t(row.titleKey as never);
  const body = t(row.bodyKey as never);

  return (
    <RiseIn duration={DURATION.sheetUp} style={[styles.card, { backgroundColor: state.tint }]}>
      <View testID={testID} accessible accessibilityRole="summary" accessibilityLiveRegion="polite" accessibilityLabel={[chip, title, body, lead].filter(Boolean).join('. ')}>
        <StateBadge tone={tone} shape={glyph as StateBadgeShape} label={chip} testID="answer-verdict-badge" />
        <Text style={[textRole(pairing, titleRole), styles.title, { color: state.color }]}>{title}</Text>
        <Text style={{ ...textRole(pairing, 'body'), color: stateMuted }}>{body}</Text>
        {lead !== null ? (
          <Text
            testID="answer-verdict-lead"
            scale="capped"
            style={[textRole(pairing, 'bodyStrong'), styles.lead, { color: tone === 'short' ? stateColors.short.color : state.color }]}
          >
            {lead}
          </Text>
        ) : null}
        {boughtOn !== null ? <Text style={{ ...textRole(pairing, 'label'), color: stateMuted }}>{boughtOn}</Text> : null}
      </View>
    </RiseIn>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  title: { marginTop: space.gapSm },
  lead: { fontVariant: ['tabular-nums'], marginTop: space.gapSm },
});
