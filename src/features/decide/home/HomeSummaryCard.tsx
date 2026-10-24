import React, { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, type Href } from 'expo-router';
import type { DecideSettingsRow } from '@/db/decideSettings';
import { currencyCode } from '@/engine/money';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { FONT_PAIRINGS } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { SURFACE_ON_INK_OPACITY } from '@/ui/Chip';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Text } from '@/ui/Text';
import { moneyA11yFn, moneyFn } from '../check/steps/stepUi';
import { QuickCheckForm } from '../quick/QuickCheckForm';
import type { CheckInputs, SnapshotResult } from '../snapshot/types';
import { DarkPill } from '../ui/DarkPill';
import { InfoLabel } from '../ui/InfoLabel';
import { useInfoSheet } from '../ui/useInfoSheet';
import { openNewCheck } from './checkHref';
import { homeCardModel, type HomeCardLabel, type HomeCardModel, type HomeJudgeOn } from './homeCardModel';
import { heroAmountText, heroOneLineMax } from './heroAmountText';

export { heroAmountText };

/** The hero's declared rule-N exception (R17.7): 0.75 instead of 0.8, so "$1,234,567" fits at 320 wide and 2.0x. */
const HERO_MIN_FONT_SCALE = 0.75;

export interface HomeHeroProps {
  /** The formatted absolute amount ("$1,240"). */
  amount: string;
  /** The word after it: "left" or "short" (already translated). */
  word: string;
  short: boolean;
}

/** R17.13 M2: two Texts in a wrapping baseline row. The amount stays whole on line 1; the word wraps under it. */
export function HomeHero({ amount, word, short }: HomeHeroProps) {
  const { colors, pairing } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const { text, fitOneLine } = heroAmountText(amount, heroOneLineMax(width, fontScale));
  const base = {
    fontFamily: FONT_PAIRINGS[pairing].display,
    fontSize: fontSize.netWorth,
    lineHeight: fontSize.netWorth * 1.0,
    letterSpacing: fontSize.netWorth * -0.01,
  };
  return (
    <View style={styles.row}>
      <Text
        scale="capped"
        numberOfLines={fitOneLine ? 1 : undefined}
        adjustsFontSizeToFit={fitOneLine}
        minimumFontScale={HERO_MIN_FONT_SCALE}
        style={[base, styles.amount, { color: short ? colors.dangerTint2 : colors.surface }]}
      >
        {text}
      </Text>
      <Text scale="capped" style={[base, styles.word, { color: colors.surface }]}>
        {word}
      </Text>
    </View>
  );
}

/** R18.1: the basis moves from the eyebrow (now the constant card.eyebrow) to the sub-line, one key per engine basis. */
const LABEL_KEY = {
  month: 'decide.home.hero.subMonth',
  worst: 'decide.home.hero.subWorst',
  average: 'decide.home.hero.subAverage',
  tightest: 'decide.home.hero.subTightest',
  figures: 'decide.home.hero.subFigures',
  switched: 'decide.home.hero.subSwitched',
} as const satisfies Record<HomeCardLabel, string>;
const SUB_LINE = 18; // the label role's line height (13 x 1.4 rounded), to centre the sub-line's info glyph
const EYEBROW_LINE = 20;
const HERO_SKELETON = 46;
const INOUT_SKELETON = 20;
const CHEVRON = '›';

export interface HomeSummaryCardProps {
  source: SnapshotResult | null;
  settings: DecideSettingsRow | null;
  status: 'loading' | 'error' | 'ready';
  /** The per-user `homeBasisSeen` flag (05-110). The screen sets it after the logged basis rendered (model.markBasisSeen). */
  homeBasisSeen: boolean;
  /** D-107: the Judge-on choice; undefined until the screen passes it (plan 05-140), null = not read yet. */
  judgeOn?: HomeJudgeOn | null;
  currency: string;
  today: string;
  /** Opens the Month details sheet (Details, and a press on the hero area). */
  onOpenDetails: () => void;
  /** Opens the shared RoughFiguresSheet. */
  onAddRough: () => void;
  /** Reloads the figures ("Try again"). */
  onRetry: () => void;
  /** "Run the full check" from the quick result (D-23). */
  onRunFull: (inputs: CheckInputs) => void;
}

/** The dark card (D-95, D-97): label, hero, In/Out, the dark quick check and Full check. Its states come from homeCardModel. */
export function HomeSummaryCard({
  source,
  settings,
  status,
  homeBasisSeen,
  judgeOn,
  currency,
  today,
  onOpenDetails,
  onAddRough,
  onRetry,
  onRunFull,
}: HomeSummaryCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const fmt = useMoneyFormatter(false, currency);
  const whole = moneyFn(fmt, currencyCode(currency));
  const wholeA11y = moneyA11yFn(fmt, currencyCode(currency));
  const tightestInfo = useInfoSheet('tightestFigures');
  const nfcfInfo = useInfoSheet('netFreeCashFlow');
  const [resultOpen, setResultOpen] = useState(false);

  const model: HomeCardModel = homeCardModel(source, settings, { status, homeBasisSeen, today, judgeOn });

  const eyebrowStyle = {
    ...textRole(pairing, 'label'),
    fontSize: fontSize.eyebrow,
    lineHeight: EYEBROW_LINE,
    color: colors.inkSoft1,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.2,
  };
  const metaStyle = { ...textRole(pairing, 'label'), fontSize: fontSize.meta };

  const quick = (
    <QuickCheckForm
      surface="home"
      variant="dark"
      source={source}
      sourceStatus={status}
      today={today}
      currency={currency}
      onRunFull={onRunFull}
      onAddRough={onAddRough}
      onRetry={onRetry}
      placeholder={t('decide.home.field.placeholder')}
      placeholderShort={t('decide.home.field.placeholderShort')}
      fieldA11yLabel={t('decide.home.field.a11y')}
      onResultOpenChange={setResultOpen}
    />
  );

  // The failed load is the form's own dark error state ("Your figures didn't load", Try again): nothing else to say.
  if (model.state === 'error') {
    return (
      <View style={[styles.card, { backgroundColor: colors.ink }]} testID="home-summary-card">
        {quick}
      </View>
    );
  }

  if (model.state === 'loading') {
    return (
      <View style={[styles.card, { backgroundColor: colors.ink }]} testID="home-summary-card">
        <View accessible accessibilityLabel={t('decide.home.card.loading')} accessibilityState={{ busy: true }} style={styles.group}>
          <SkeletonBar minHeight={HERO_SKELETON} width="55%" />
          <SkeletonBar minHeight={INOUT_SKELETON} width="75%" />
        </View>
        {quick}
      </View>
    );
  }

  const subText = t(LABEL_KEY[model.label]);
  const infoShown = model.state === 'figure' && model.info === 'tightestFigures';
  const detailsShown = model.state !== 'first_run';

  // R18.1: the constant eyebrow, then the ⓘ as the next flex sibling (rule I); "Details ›" stays at the right.
  const eyebrow = (
    <View style={styles.eyebrowRow}>
      <View style={styles.eyebrowLeft}>
        <InfoLabel term={nfcfInfo.term} onInfo={nfcfInfo.open} tone="dark" lineHeight={EYEBROW_LINE}>
          <Text style={eyebrowStyle} accessibilityElementsHidden importantForAccessibility="no">
            {t('decide.home.card.eyebrow')}
          </Text>
        </InfoLabel>
      </View>
      {detailsShown ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('decide.home.card.detailsA11y')}
          onPress={onOpenDetails}
          style={({ pressed }) => [styles.details, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkSoft1 }}>{`${t('decide.home.card.details')} ${CHEVRON}`}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  let summary: React.ReactNode;
  if (model.state === 'figure') {
    const params = { amount: whole(model.amount), in: whole(model.inAmount), out: whole(model.outAmount) };
    const a11yParams = { basis: subText, amount: wholeA11y(model.amount), in: wholeA11y(model.inAmount), out: wholeA11y(model.outAmount) };
    summary = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(model.short ? 'decide.home.card.a11yNfcfOverspent' : 'decide.home.card.a11yNfcfFree', a11yParams)}
        accessibilityHint={t('decide.home.card.detailsHint')}
        onPress={onOpenDetails}
        style={({ pressed }) => [styles.summary, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        {resultOpen ? (
          // R17.2: while a result is open the hero shrinks to the In/Out size and the sub-line hides.
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.surface }}>
            {t(model.short ? 'decide.home.hero.summaryOverspent' : 'decide.home.hero.summary', params)}
          </Text>
        ) : (
          <>
            <HomeHero amount={params.amount} word={t(model.short ? 'decide.home.hero.overspentWord' : 'decide.home.hero.freeWord')} short={model.short} />
            {infoShown ? (
              <InfoLabel term={tightestInfo.term} onInfo={tightestInfo.open} tone="dark" lineHeight={SUB_LINE}>
                <Text style={{ ...metaStyle, color: colors.inkSoft1 }}>{subText}</Text>
              </InfoLabel>
            ) : (
              <Text style={{ ...metaStyle, color: colors.inkSoft1 }}>{subText}</Text>
            )}
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkSoft2 }}>
              {t('decide.home.hero.inOut', { in: params.in, out: params.out })}
            </Text>
          </>
        )}
      </Pressable>
    );
  } else {
    const u = model.unavailable;
    const reason =
      u.reason === 'missing_rate' ? t('decide.home.unavailable.rate', { currency: u.currencies.join(', ') }) : t('decide.home.unavailable.noFigures');
    summary = (
      <View style={styles.group}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.surface }}>
          {t('decide.home.unavailable.title')}
        </Text>
        <Text style={{ ...metaStyle, color: colors.inkSoft1 }}>{reason}</Text>
        <View style={styles.action}>
          <DarkPill
            variant="solid"
            label={t(u.action === 'add_rough' ? 'decide.home.unavailable.addRough' : 'decide.home.unavailable.seeLines')}
            onPress={u.action === 'add_rough' ? onAddRough : () => router.navigate('/activity' as Href)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.ink }]} testID="home-summary-card">
      {/* column-reverse: the summary group comes first in reading order (R17.7) while the eyebrow row sits above it. */}
      <View style={styles.top}>
        {summary}
        {eyebrow}
      </View>
      {quick}
      {resultOpen ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('decide.home.field.fullA11y')}
          onPress={() => openNewCheck('buy')}
          style={({ pressed }) => [styles.full, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkSoft1 }}>{`${t('decide.home.field.full')} ${CHEVRON}`}</Text>
        </Pressable>
      )}
      {tightestInfo.sheet}
      {nfcfInfo.sheet}
    </View>
  );
}

function SkeletonBar({ minHeight, width }: { minHeight: number; width: `${number}%` }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.skeleton, { minHeight, width }]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: SURFACE_ON_INK_OPACITY }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.gapSm },
  amount: { flexShrink: 1 },
  word: { flexShrink: 1 },
  card: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapMd },
  top: { flexDirection: 'column-reverse', gap: space.gapMd },
  eyebrowRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: space.gapSm },
  eyebrowLeft: { flexShrink: 1 },
  details: { minHeight: space.touchMin, minWidth: space.touchMin, justifyContent: 'center', alignItems: 'flex-end' },
  summary: { gap: 4 },
  group: { gap: space.gapSm },
  action: { flexDirection: 'row' },
  full: { alignSelf: 'flex-end', minHeight: space.touchMin, minWidth: space.touchMin, justifyContent: 'center', alignItems: 'flex-end' },
  skeleton: { borderRadius: radii.pill, overflow: 'hidden' },
});
