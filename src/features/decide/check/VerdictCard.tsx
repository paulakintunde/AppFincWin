/**
 * 05-15 Step 3 verdict card (D-05, D-04, D-22, D-37, DCU-10, DCU-11): the answer first. Chip, basis marker, size label,
 * title (3 lines), body (2 lines). Declarative voice only; every string comes from the 05-09 copy layer. The card is one
 * polite live region whose label settles after typing (useSettledLabel).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { DURATION, useReduceMotion } from '@/theme/motion';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import type { Confidence, Verdict } from '@/engine/decide';
import { MISSING_TITLE, SIZE_LABEL } from '../copy/codeMaps';
import { ref } from '../copy/types';
import type { CopyRef, Fmt } from '../copy/types';
import { basisMarker, missingRateCopy, stateChip, verdictBody, verdictTitle } from '../copy/verdictCopy';
import { confidenceCopy, edgeChipA11y, edgeOn, verdictLineOne } from '../copy/depthVerdictCopy';
import type { CheckComputation, ConversionNote } from '../snapshot/types';
import { ConfidenceChip } from '../ui/ConfidenceChip';
import { EdgeTag } from '../ui/EdgeTag';
import { StateChip, type StateChipTone } from '../ui/StateChip';
import { refText, type Translate } from './refText';
import { joinSentences } from './joinSentences';
import { useSettledLabel } from './useSettledLabel';
import { ConfidenceSheet } from './ConfidenceSheet';

export interface VerdictCardProps {
  computation: CheckComputation;
  lastSeenBasis: 'logged_months' | 'first_read_rough_figures' | null;
  fmt: Fmt;
  /** D-28: converted currencies, listed as reasons on the sheet. */
  conversions: readonly ConversionNote[];
  /** D-28: full months logged (SnapshotMeta.fullMonths), the first reason row. */
  fullMonths: number;
  formatDate: (localDate: string) => string;
  locale: string;
}

/** 'YYYY-MM' to the month's display name in the user's locale. */
function monthNameIn(locale: string): (month: string) => string {
  return (month) => {
    const [y, m] = month.split('-') as [string, string];
    return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(Number(y), Number(m) - 1, 1));
  };
}

interface CardCopy {
  chip: { key: string; tone: StateChipTone } | null;
  size: CopyRef | null;
  title: CopyRef;
  body: CopyRef | null;
  basis: CopyRef | null;
  link: CopyRef | null;
  confidence: Confidence | null;
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
    return { chip: { key: m.chip.key, tone: 'missing' }, size: null, title: m.title, body: m.body, basis: null, link: m.link, confidence: null };
  }
  if (c.status === 'none') {
    return { chip: null, size: null, title: ref('decide.quick.line.missing'), body: null, basis: null, link: null, confidence: null };
  }
  if (c.status === 'first_read' && c.firstRead) {
    const fr = c.firstRead;
    const basis = basisMarker({ kind: 'first_read', money: null, lastSeenBasis }, fmt);
    if (fr.state === 'missing') {
      return {
        chip: chipOf('missing', 'full', fr.reasons),
        size: ref(SIZE_LABEL[fr.size]),
        // IN-C05: a missing first read with no reason gets the generic title, never the card one
        title: fr.reasons[0] === undefined ? ref('decide.verdict.missingGeneric') : ref(MISSING_TITLE[fr.reasons[0]]),
        body: null,
        basis,
        link: null,
        confidence: fr.confidence,
      };
    }
    return { chip: chipOf(fr.state, 'full'), size: ref(SIZE_LABEL[fr.size]), title: firstReadTitle(fr, fmt), body: null, basis, link: null, confidence: fr.confidence };
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
        confidence: v.confidence,
      };
    }
    return {
      chip: chipOf(v.state, 'full'),
      size: ref(SIZE_LABEL[v.size]),
      title: verdictTitle(v, fmt),
      body: verdictBody(v, fmt),
      basis: basisMarker({ kind: 'logged', money: v.context.money, lastSeenBasis }, fmt),
      link: null,
      confidence: v.confidence,
    };
  }
  return null;
}

export function VerdictCard({ computation, lastSeenBasis, fmt, conversions, fullMonths, formatDate, locale }: VerdictCardProps) {
  const t = useT() as Translate;
  const router = useRouter();
  const { colors, pairing } = useTheme();
  const reduced = useReduceMotion();
  const [sheetOpen, setSheetOpen] = useState(false);
  const copy = cardCopy(computation, lastSeenBasis, fmt);
  const decision = computation.status === 'logged' ? computation.decision : null;
  const lineOne = decision ? verdictLineOne(decision, fmt, monthNameIn(locale)) : null;
  const lineOneText = lineOne ? refText(t, lineOne) : '';
  const chipLabel = copy?.chip ? t(copy.chip.key) : '';
  const sizeText = copy?.size ? refText(t, copy.size) : '';
  const titleText = copy ? refText(t, copy.title) : '';
  const sentenceText = copy?.body ? refText(t, copy.body) : '';
  const basisText = copy?.basis ? refText(t, copy.basis) : '';
  const confidence = copy?.confidence ?? null;
  const confidenceText = confidence ? refText(t, confidenceCopy(confidence.level)) : '';
  const onEdge = decision !== null && edgeOn(decision);
  let chipName = chipLabel;
  if (decision && onEdge) {
    const a11y = edgeChipA11y(chipLabel, decision, fmt, formatDate);
    const params = { ...(a11y.label.params ?? {}), ...(a11y.fact ? { fact: refText(t, a11y.fact) } : {}) };
    chipName = refText(t, { ...a11y.label, params });
  }
  const bodyText = [lineOneText, sentenceText].filter((x) => x !== '').join('\n');
  const label = joinSentences([chipName, sizeText, confidenceText, titleText, lineOneText, sentenceText, basisText]);
  const settled = useSettledLabel(label, copy?.chip?.tone ?? 'none', SETTLE_MS);
  if (!copy) return null;

  const verdict = computation.status === 'logged' ? computation.verdict : null;
  const resolved = verdict && verdict.state !== 'missing' ? verdict : null;
  const codes = resolved ? resolved.basisCodes : [];
  const facts = {
    fullMonths,
    steadiness: resolved ? resolved.context.money.steadiness : null,
    oneOffs: resolved && codes.includes('one_offs_excluded') ? resolved.context.money.oneOffsExcluded.count : 0,
    conversions,
  };
  const danger = copy.chip?.tone === 'no';
  const background = danger ? colors.danger : colors.ink;
  const soft = colors.inkSoft1;
  // WR-C05: the card is one accessible element, so its confidence chip and missing-rate link cannot be focused inside it;
  // both are offered as the card's own accessibility actions instead.
  const linkText = copy.link ? refText(t, copy.link) : '';
  const openActivity = (): void => router.push('/activity' as Href);
  const actions = [
    ...(confidence ? [{ name: 'confidence', label: confidenceText }] : []),
    ...(copy.link ? [{ name: 'openActivity', label: linkText }] : []),
  ];
  const card = (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={settled}
      accessibilityActions={actions.length > 0 ? actions : undefined}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'confidence') setSheetOpen(true);
        else if (e.nativeEvent.actionName === 'openActivity') openActivity();
      }}
      style={[styles.card, { backgroundColor: background }]}
    >
      <View style={styles.top}>
        {copy.chip ? (
          <View accessible={onEdge} accessibilityLabel={onEdge ? chipName : undefined} style={styles.chips}>
            <StateChip tone={copy.chip.tone} label={chipLabel} />
            {onEdge ? <EdgeTag /> : null}
          </View>
        ) : (
          <View />
        )}
        {basisText ? (
          <Text style={[styles.basis, { ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: soft }]}>{basisText}</Text>
        ) : null}
      </View>
      {sizeText || confidence ? (
        <View style={styles.sizeRow}>
          {sizeText ? (
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: soft, textTransform: 'uppercase', letterSpacing: 1.2 }}>
              {sizeText}
            </Text>
          ) : (
            <View />
          )}
          {confidence ? <ConfidenceChip level={confidence.level} onPress={() => setSheetOpen(true)} /> : null}
        </View>
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
          onPress={openActivity}
          style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{linkText}</Text>
        </Pressable>
      ) : null}
    </View>
  );
  return (
    <>
      {reduced ? card : <Animated.View entering={FadeInDown.duration(DURATION.entrance)}>{card}</Animated.View>}
      {confidence ? <ConfidenceSheet visible={sheetOpen} confidence={confidence} facts={facts} onClose={() => setSheetOpen(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapSm },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.gapMd },
  chips: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  // the chip's 44 hit target overflows the 27-high row visually; the negative margin keeps the layout budget (DCU-11)
  sizeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: -8 },
  basis: { flexShrink: 1, textAlign: 'right' },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
