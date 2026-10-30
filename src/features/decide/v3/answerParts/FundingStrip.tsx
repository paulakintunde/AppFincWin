/**
 * 05.3-26 (UI-SPEC "Funding strip"): a 16-high bar of segments with a wrapping legend of bold amounts. The bar is hidden from
 * assistive tech; the block reads one sentence built from the same parts, so the sentence and the drawing cannot disagree.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import type { FundingStrip as FundingStripModel, StripPart, StripStyle } from '@/features/decide/v3/model/funding';
import { useV3Format, type V3Format } from '@/features/decide/v3/shared/useV3Format';
import { radii, space } from '@/theme/layout';
import { DURATION, EASING, useReduceMotion } from '@/theme/motion';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const MONEY_PARAMS = ['price', 'amount'] as const;

function isYearMonth(v: string | number): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);
}

/** Turns a part's label key and params into the words beside its amount. */
function partLabel(t: Translate, f: V3Format, part: StripPart): string {
  const raw = part.params ?? {};
  const screen: Record<string, string | number> = {};
  const rest: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'month' && isYearMonth(v)) screen.month = f.month(v);
    else if (k === 'date' && typeof v === 'string') screen.date = f.date(v);
    else rest[k] = v;
  }
  const resolved = f.flat(rest, []).screen;
  return t(part.labelKey, { ...resolved, ...screen });
}

interface FillStyle {
  backgroundColor?: string;
  opacity?: number;
  borderStyle?: 'dashed';
  borderWidth?: number;
  borderColor?: string;
}

function useFill(style: StripStyle): FillStyle {
  const { colors } = useTheme();
  switch (style) {
    case 'accent':
      return { backgroundColor: colors.accent };
    case 'accentHalf':
      return { backgroundColor: colors.accent, opacity: 0.5 };
    case 'ink':
      return { backgroundColor: colors.ink };
    case 'warn':
      return { backgroundColor: colors.warn1 };
    case 'soft':
      return { backgroundColor: colors.inkSoft2 };
    case 'dashed':
      return { borderStyle: 'dashed', borderWidth: 1.5, borderColor: colors.inkSoft1 };
  }
}

function Segment({ part }: { part: StripPart }): React.JSX.Element {
  const fill = useFill(part.style);
  return <View testID={`strip-segment-${part.style}`} style={[styles.segment, { flexGrow: Number(part.amount) }, fill]} />;
}

function Dot({ style }: { style: StripStyle }): React.JSX.Element {
  const fill = useFill(style);
  return <View testID={`strip-dot-${style}`} style={[styles.dot, fill]} />;
}

export function FundingStrip({ model }: { model: FundingStripModel | null }): React.JSX.Element | null {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors, pairing } = useTheme();
  const reduced = useReduceMotion();
  const reveal = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    reveal.value = reduced ? 1 : withTiming(1, { duration: DURATION.progress, easing: EASING });
  }, [reduced, reveal]);
  const revealStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));

  if (model === null) return null;

  const headingParams: Record<string, string> = {};
  const a11yHeadingParams: Record<string, string> = {};
  for (const key of MONEY_PARAMS) {
    const v = model.headingParams[key];
    if (typeof v === 'number') {
      headingParams[key] = f.money(v);
      a11yHeadingParams[key] = f.moneyA11y(v);
    }
  }
  const heading = t(model.headingKey, headingParams);
  const a11yHeading = t(model.headingKey, a11yHeadingParams);
  const labels = model.parts.map((p) => partLabel(t, f, p));
  const spoken = model.parts.map((p, i) =>
    t('decide.v3.ui.answer.stripPart', { amount: f.moneyA11y(Number(p.amount)), label: labels[i] }),
  );
  const sentence = t('decide.v3.ui.answer.stripA11y', { heading: a11yHeading, parts: spoken.join(', ') });

  return (
    <View accessible accessibilityLabel={sentence} style={styles.block}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{heading}</Text>
      <Animated.View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        testID="strip-bar"
        style={[styles.bar, { backgroundColor: colors.fill1 }, revealStyle]}
      >
        {model.parts.map((p, i) => (
          <Segment key={`${p.labelKey}-${i}`} part={p} />
        ))}
      </Animated.View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.legend}>
        {model.parts.map((p, i) => (
          <View key={`${p.labelKey}-${i}`} style={styles.legendItem}>
            <Dot style={p.style} />
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim, flexShrink: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{f.money(Number(p.amount))}</Text>
              {` ${labels[i]}`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
  bar: { height: 16, borderRadius: radii.pill, overflow: 'hidden', flexDirection: 'row' },
  segment: { height: 16 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  dot: { width: 10, height: 10, borderRadius: 3 },
});
