/**
 * 05-63 Step 3 verdict card (D-74, D-70, D-76, UI-SPEC R2), summary first: size label and edge tag with their info
 * buttons and the confidence chip, the state words as the heading, the one-line reason, the difference line, three key
 * figures and the basis marker. Nothing is clamped. Declarative voice only; every string comes from the copy layer.
 * Three focus stops: the summary group (a polite live region whose label settles after typing, useSettledLabel), the
 * size/edge info buttons and the chip, then the key-figures group (its Cushion info button inside it).
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
import type { Confidence, MinorUnits, Verdict } from '@/engine/decide';
import { MISSING_TITLE, SIZE_LABEL } from '../copy/codeMaps';
import { ref } from '../copy/types';
import type { CopyRef, Fmt } from '../copy/types';
import { basisMarker, missingRateCopy, stateChip, verdictTitle } from '../copy/verdictCopy';
import { cushionCopy, edgeChipA11y, edgeOn, verdictLineOne } from '../copy/depthVerdictCopy';
import { keyFigureInputs, keyFigures } from '../copy/keyFiguresCopy';
import type { ExpectedReturn } from '../snapshot/expectedReturn';
import type { CheckComputation, ConversionNote } from '../snapshot/types';
import { ConfidenceChip } from '../ui/ConfidenceChip';
import { EdgeTag } from '../ui/EdgeTag';
import { FigureStrip } from '../ui/FigureStrip';
import { InfoLabel } from '../ui/InfoLabel';
import { useInfoSheet } from '../ui/useInfoSheet';
import type { StateChipTone } from '../ui/StateChip';
import { refText, type Translate } from './refText';
import { joinSentences } from './joinSentences';
import { useSettledLabel } from './useSettledLabel';
import { ConfidenceSheet } from './ConfidenceSheet';

export interface VerdictCardProps {
  computation: CheckComputation;
  lastSeenBasis: 'logged_months' | 'first_read_rough_figures' | null;
  fmt: Fmt;
  /** Exact (cents) formatter for the monthly cost key figure (D-54). */
  fmtCents: Fmt;
  /** Rough monthly spending when the source is a first read: the cushion's burn (R2). */
  roughBurn?: MinorUnits | null;
  /** D-28: converted currencies, listed as reasons on the sheet. */
  conversions: readonly ConversionNote[];
  /** D-28: full months logged (SnapshotMeta.fullMonths), the first reason row. */
  fullMonths: number;
  formatDate: (localDate: string) => string;
  locale: string;
  /** 05-87 (D-82, R15.5): the investment projection at the user's own rate. Display only: nothing here reads it to decide anything. */
  projection?: ExpectedReturn | null;
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
  basis: CopyRef | null;
  link: CopyRef | null;
  confidence: Confidence | null;
}

const SETTLE_MS = 150;
const SIZE_LINE = 16; // the eyebrow's first-line height, so the size info button centres on it (rule I)

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
    return { chip: { key: m.chip.key, tone: 'missing' }, size: null, title: m.title, basis: null, link: m.link, confidence: null };
  }
  if (c.status === 'none') {
    return { chip: null, size: null, title: ref('decide.quick.line.missing'), basis: null, link: null, confidence: null };
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
        basis,
        link: null,
        confidence: fr.confidence,
      };
    }
    return { chip: chipOf(fr.state, 'full'), size: ref(SIZE_LABEL[fr.size]), title: firstReadTitle(fr, fmt), basis, link: null, confidence: fr.confidence };
  }
  if (c.status === 'logged' && c.verdict) {
    const v: Verdict = c.verdict;
    if (v.state === 'missing') {
      return {
        chip: chipOf('missing', 'full', v.reasons),
        size: v.size ? ref(SIZE_LABEL[v.size]) : null,
        title: verdictTitle(v, fmt),
        basis: null,
        link: null,
        confidence: v.confidence,
      };
    }
    return {
      chip: chipOf(v.state, 'full'),
      size: ref(SIZE_LABEL[v.size]),
      title: verdictTitle(v, fmt),
      basis: basisMarker({ kind: 'logged', money: v.context.money, lastSeenBasis }, fmt),
      link: null,
      confidence: v.confidence,
    };
  }
  return null;
}


/** Standalone text the summary label already reads: no focus stop of its own (R2 Accessibility). */
const NOT_A_STOP = { accessible: false, importantForAccessibility: 'no' } as const;

export function VerdictCard({ computation, lastSeenBasis, fmt, fmtCents, roughBurn = null, conversions, fullMonths, formatDate, locale, projection = null }: VerdictCardProps) {
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
  const basisText = copy?.basis ? refText(t, copy.basis) : '';
  const confidence = copy?.confidence ?? null;
  const onEdge = decision !== null && edgeOn(decision);
  let stateWords = chipLabel;
  if (decision && onEdge) {
    const a11y = edgeChipA11y(chipLabel, decision, fmt, formatDate);
    const params = { ...(a11y.label.params ?? {}), ...(a11y.fact ? { fact: refText(t, a11y.fact) } : {}) };
    stateWords = refText(t, { ...a11y.label, params });
  }
  const verdict = computation.status === 'logged' ? computation.verdict : null;
  const resolved = verdict && verdict.state !== 'missing' ? verdict : null;

  // D-74: the three figures; null for missing, none and unconverted
  const figures = copy ? keyFigureInputs(computation, roughBurn) : null;
  const keys = figures ? keyFigures(figures, fmt, fmtCents, (r) => refText(t, r)) : null;

  // D-70: the user's own reserve months and why, when the snapshot gives them
  const halves = resolved ? resolved.context.limits.reserveHalfMonths : null;
  const sizeInfo = useInfoSheet('size');
  const edgeInfo = useInfoSheet('edge');
  const cushionInfo = useInfoSheet(
    'cushionMonths',
    resolved && halves !== null ? { cushionMonths: { months: halves / 2, reason: cushionCopy(resolved.context) } } : undefined,
  );

  const projectionText =
    projection !== null && projection.fv !== null && computation.check?.kind === 'invest'
      ? t('decide.verdict.projection', { count: projection.months, fv: fmt(projection.fv), rate: projection.rateText })
      : '';

  const label = joinSentences([stateWords, sizeText, titleText, lineOneText, basisText]);
  const settled = useSettledLabel(label, copy?.chip?.tone ?? 'none', SETTLE_MS);
  if (!copy) return null;

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
  const linkText = copy.link ? refText(t, copy.link) : '';
  const openActivity = (): void => router.push('/activity' as Href);
  const sizeLine = { ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: soft, textTransform: 'uppercase' as const, letterSpacing: 1.2 };

  const figureItems = keys
    ? keys.items.map((item, i) => ({
        caption: item.caption,
        value: item.value,
        kind: item.kind,
        tone: item.negative ? ('negative' as const) : ('neutral' as const),
        ...(i === 1 ? { captionAccessory: cushionInfo.button('dark') } : {}),
      }))
    : null;

  const card = (
    <View style={[styles.card, { backgroundColor: background }]}>
      {/* column-reverse: the summary group is first in focus order and the info buttons and chip follow it, while the
          size / edge / chip row is drawn above the verdict (R2 focus order) */}
      <View style={styles.top}>
        <View accessible accessibilityLiveRegion="polite" accessibilityLabel={settled} style={styles.summary}>
          {chipLabel ? (
            <Text accessibilityRole="header" scale="capped" style={{ ...textRole(pairing, 'heading'), color: colors.surface }}>
              {chipLabel}
            </Text>
          ) : null}
          <Text style={{ ...textRole(pairing, 'body'), color: colors.surface }}>{titleText}</Text>
          {lineOneText ? (
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, fontWeight: '600', color: colors.inkSoft2 }}>
              {lineOneText}
            </Text>
          ) : null}
        </View>
        {sizeText || confidence || onEdge ? (
          <View style={styles.chips}>
            {sizeText ? (
              <InfoLabel term={sizeInfo.term} onInfo={sizeInfo.open} tone="dark" lineHeight={SIZE_LINE}>
                <Text {...NOT_A_STOP} style={sizeLine}>
                  {sizeText}
                </Text>
              </InfoLabel>
            ) : null}
            {onEdge ? (
              <View style={styles.edge}>
                <View accessible={false} importantForAccessibility="no">
                  <EdgeTag />
                </View>
                {edgeInfo.button('dark')}
              </View>
            ) : null}
            {confidence ? (
              <View style={styles.chip}>
                <ConfidenceChip level={confidence.level} onPress={() => setSheetOpen(true)} />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {copy.link ? (
        <Pressable
          accessibilityRole="link"
          onPress={openActivity}
          style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{linkText}</Text>
        </Pressable>
      ) : null}
      {figureItems && keys ? (
        <View style={styles.figures}>
          <FigureStrip
            dark
            items={figureItems}
            group={{ label: joinSentences([refText(t, keys.a11y), projectionText]), actions: [cushionInfo.aboutAction], onAction: cushionInfo.onAccessibilityAction }}
          />
        </View>
      ) : null}
      {basisText ? (
        <Text {...NOT_A_STOP} style={[styles.basis, { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: soft }]}>
          {basisText}
        </Text>
      ) : null}
      {projectionText ? (
        <Text {...NOT_A_STOP} testID="verdict-projection" style={[styles.basis, { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkSoft2 }]}>
          {projectionText}
        </Text>
      ) : null}
    </View>
  );
  return (
    <>
      {reduced ? card : <Animated.View entering={FadeInDown.duration(DURATION.entrance)}>{card}</Animated.View>}
      {sizeText ? sizeInfo.sheet : null}
      {onEdge ? edgeInfo.sheet : null}
      {figureItems ? cushionInfo.sheet : null}
      {confidence ? <ConfidenceSheet visible={sheetOpen} confidence={confidence} facts={facts} onClose={() => setSheetOpen(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPadLg },
  // the summary group is first in the tree and drawn below the chips row
  top: { flexDirection: 'column-reverse', gap: 10 },
  summary: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.gapMd, rowGap: space.gapSm },
  edge: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, flexShrink: 1 },
  chip: { marginLeft: 'auto' },
  figures: { marginTop: space.gapMd },
  basis: { marginTop: space.gapSm },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
