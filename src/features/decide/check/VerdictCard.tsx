/**
 * 05-15 Step 3 verdict card (D-05, D-04, D-22, D-37, DCU-10, DCU-11): the answer first. Chip, basis marker, size label,
 * title (3 lines), body (2 lines). Declarative voice only; every string comes from the 05-09 copy layer. The card is one
 * polite live region whose label settles after typing (useSettledLabel).
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { DURATION, useReduceMotion } from '@/theme/motion';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import type { Verdict } from '@/engine/decide';
import { MISSING_TITLE, SIZE_LABEL } from '../copy/codeMaps';
import { ref } from '../copy/types';
import type { CopyRef, Fmt } from '../copy/types';
import { basisMarker, missingRateCopy, stateChip, verdictBody, verdictTitle } from '../copy/verdictCopy';
import type { CheckComputation } from '../snapshot/types';
import { StateChip, type StateChipTone } from '../ui/StateChip';
import { refText, type Translate } from './refText';
import { joinSentences } from './joinSentences';
import { useSettledLabel } from './useSettledLabel';

export interface VerdictCardProps {
  computation: CheckComputation;
  lastSeenBasis: 'logged_months' | 'first_read_rough_figures' | null;
  fmt: Fmt;
}

interface CardCopy {
  chip: { key: string; tone: StateChipTone } | null;
  size: CopyRef | null;
  title: CopyRef;
  body: CopyRef | null;
  basis: CopyRef | null;
  link: CopyRef | null;
}

const SETTLE_MS = 150;
const FIGURE_CAP = 1.3;

/** Only fits, adjust, no and missing arise on this card, all of which the chip draws. */
function chipOf(...args: Parameters<typeof stateChip>): { key: string; tone: StateChipTone } {
  const c = stateChip(...args);
  return { key: c.key, tone: c.tone as StateChipTone };
}

function firstReadTitle(fr: Exclude<NonNullable<CheckComputation['firstRead']>, { state: 'missing' }>, fmt: Fmt): CopyRef {
  if (fr.state === 'fits') return ref('decide.verdict.titleFits', { left: fmt(fr.leftAfter) });
  if (fr.state === 'no' && fr.cashAfter < 0) return ref('decide.verdict.titleNoEmptyCash');
  const lead = fr.warnings[0];
  if (lead?.code === 'cash') return ref('decide.verdict.titleCash', { amount: fmt(lead.shortfall) });
  const month = fr.warnings.find((w) => w.code === 'month');
  return ref('decide.verdict.titleNoMonthShort', { short: fmt(month ? month.shortfall : 0) });
}

function cardCopy(c: CheckComputation, lastSeenBasis: VerdictCardProps['lastSeenBasis'], fmt: Fmt): CardCopy | null {
  if (c.status === 'unconverted' && c.unconverted) {
    const m = missingRateCopy(c.unconverted);
    return { chip: { key: m.chip.key, tone: 'missing' }, size: null, title: m.title, body: m.body, basis: null, link: m.link };
  }
  if (c.status === 'none') {
    return { chip: null, size: null, title: ref('decide.quick.line.missing'), body: null, basis: null, link: null };
  }
  if (c.status === 'first_read' && c.firstRead) {
    const fr = c.firstRead;
    const basis = basisMarker({ kind: 'first_read', money: null, lastSeenBasis }, fmt);
    if (fr.state === 'missing') {
      return {
        chip: chipOf('missing', 'full', fr.reasons),
        size: ref(SIZE_LABEL[fr.size]),
        title: ref(MISSING_TITLE[fr.reasons[0] ?? 'card_missing']),
        body: null,
        basis,
        link: null,
      };
    }
    return { chip: chipOf(fr.state, 'full'), size: ref(SIZE_LABEL[fr.size]), title: firstReadTitle(fr, fmt), body: null, basis, link: null };
  }
  if (c.status === 'logged' && c.verdict) {
    const v: Verdict = c.verdict;
    if (v.state === 'missing') {
      return {
        chip: chipOf('missing', 'full', v.reasons),
        size: v.size ? ref(SIZE_LABEL[v.size]) : null,
        title: verdictTitle(v, fmt),
        body: null,
        basis: null,
        link: null,
      };
    }
    return {
      chip: chipOf(v.state, 'full'),
      size: ref(SIZE_LABEL[v.size]),
      title: verdictTitle(v, fmt),
      body: verdictBody(v, fmt),
      basis: basisMarker({ kind: 'logged', money: v.context.money, lastSeenBasis }, fmt),
      link: null,
    };
  }
  return null;
}

export function VerdictCard({ computation, lastSeenBasis, fmt }: VerdictCardProps) {
  const t = useT() as Translate;
  const router = useRouter();
  const { colors, pairing } = useTheme();
  const reduced = useReduceMotion();
  const copy = cardCopy(computation, lastSeenBasis, fmt);
  const chipLabel = copy?.chip ? t(copy.chip.key) : '';
  const sizeText = copy?.size ? refText(t, copy.size) : '';
  const titleText = copy ? refText(t, copy.title) : '';
  const bodyText = copy?.body ? refText(t, copy.body) : '';
  const basisText = copy?.basis ? refText(t, copy.basis) : '';
  const label = joinSentences([chipLabel, sizeText, titleText, bodyText, basisText]);
  const settled = useSettledLabel(label, copy?.chip?.tone ?? 'none', SETTLE_MS);
  if (!copy) return null;

  const danger = copy.chip?.tone === 'no';
  const background = danger ? colors.danger : colors.ink;
  const soft = colors.inkSoft1;
  const card = (
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel={settled} style={[styles.card, { backgroundColor: background }]}>
      <View style={styles.top}>
        {copy.chip ? <StateChip tone={copy.chip.tone} label={chipLabel} /> : <View />}
        {basisText ? (
          <Text style={[styles.basis, { ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: soft }]}>{basisText}</Text>
        ) : null}
      </View>
      {sizeText ? (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: soft, textTransform: 'uppercase', letterSpacing: 1.2 }}>
          {sizeText}
        </Text>
      ) : null}
      <Text numberOfLines={3} maxFontSizeMultiplier={FIGURE_CAP} scale="capped" style={{ ...textRole(pairing, 'heading'), color: colors.surface }}>
        {titleText}
      </Text>
      {bodyText ? (
        <Text numberOfLines={2} maxFontSizeMultiplier={FIGURE_CAP} style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: soft }}>
          {bodyText}
        </Text>
      ) : null}
      {copy.link ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/activity' as Href)}
          style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{refText(t, copy.link)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
  return reduced ? card : <Animated.View entering={FadeInDown.duration(DURATION.entrance)}>{card}</Animated.View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapSm },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.gapMd },
  basis: { flexShrink: 1, textAlign: 'right' },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
