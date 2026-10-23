/**
 * 05-13 (DCU-01, D-01, D-02, D-22, D-23, D-24, D-37, UI-SPEC "Quick check"): the result block of the quick check.
 * One state chip, the size label, one line, and in Credit the monthly figure with its caption. Every word comes from the
 * 05-09 copy layer. The group is one polite live region whose label settles after typing (useSettledLabel, D-56).
 * The caption (monthly.paidOffMonth, D-45) keeps the chosen term and adds the payoff month on one line.
 * Nothing here supplies a rate: the only rate on screen is one the user typed (D-02).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { quickResultCopy } from '../copy/quickCopy';
import type { Fmt } from '../copy/types';
import { joinSentences } from '../check/joinSentences';
import { refText, refTextA11y, type Translate } from '../check/refText';
import { useSettledLabel } from '../check/useSettledLabel';
import type { QuickComputation } from '../snapshot/types';
import { CombineToggle } from '../ui/CombineToggle';
import { StateChip, type StateChipTone } from '../ui/StateChip';
import { InfoLabel } from '../ui/InfoLabel';
import { useInfoSheet } from '../ui/useInfoSheet';

export interface QuickResultProps {
  computation: Exclude<QuickComputation, { kind: 'incomplete' }>;
  mode: 'cash' | 'credit';
  name: string;
  /** WR-B08: the price read from the text, echoed next to the name so a misread figure is visible. */
  price?: number | null;
  fmt: Fmt;
  fmtCents: Fmt;
  /** D-94: the same amounts as a screen reader speaks them; the visible text is unchanged. Default to fmt / fmtCents. */
  fmtA11y?: Fmt;
  fmtCentsA11y?: Fmt;
  onTryCredit: () => void;
  /** D-24: the quick check is judged with every open check by default; session state in the hook. */
  combine: boolean;
  onCombine: (next: boolean) => void;
  /** Other open checks before filtering; the pill shows only with two or more (UI-SPEC kept, OQ-A3 declined). */
  openCount: number;
  /** The first-read surface shows its own basis line under the answer. */
  firstReadBasis?: boolean;
}

const SETTLE_MS = 150;
const FIGURE_CAP = 1.3;
const FIGURE_MIN_FONT_SCALE = 0.8; // D-76 rule N

/** How many other open checks the logged decision actually counted (status applied). */
function appliedCount(c: QuickResultProps['computation']): number {
  return c.kind === 'logged' ? c.decision.stacked.filter((s) => s.status === 'applied').length : 0;
}

export function QuickResult({ computation, mode, name, price = null, fmt, fmtCents, fmtA11y = fmt, fmtCentsA11y = fmtCents, onTryCredit, combine, onCombine, openCount, firstReadBasis = false }: QuickResultProps) {
  const t = useT() as Translate;
  const shownName = name === '' ? t('decide.quick.unnamed') : name;
  const { colors, pairing } = useTheme();
  const fullName = price != null ? t('decide.quick.nameAt', { name: shownName, price: fmtCents(price) }) : shownName;
  const copy = quickResultCopy(computation, mode, fmt, fmtCents);
  const spoken = quickResultCopy(computation, mode, fmtA11y, fmtCentsA11y);
  const spokenName = price != null ? t('decide.quick.nameAt', { name: shownName, price: fmtCentsA11y(price) }) : shownName;
  const chipLabel = copy.chip ? t(copy.chip.key) : '';
  const sizeText = copy.size ? t(copy.size) : '';
  const lineText = refText(t, copy.line);
  const spokenLine = refTextA11y(t, copy.line, spoken.line.params);
  const settled = useSettledLabel(joinSentences([chipLabel, sizeText, spokenLine]), copy.chip?.tone ?? 'none', SETTLE_MS);
  const caption = copy.caption ? refText(t, copy.caption) : '';
  const basis = copy.basis ? t(copy.basis) : firstReadBasis ? t('decide.onboarding.basis') : '';

  const applied = combine ? appliedCount(computation) : 0;
  const showPill = openCount >= 2;
  const combinedLine = !showPill && applied >= 1;
  const credit = mode === 'credit';
  // R2b: Credit ends the result block with the footer; Cash has a footer row only when the pill or the one-open-check line applies.
  const showFooter = credit || showPill || combinedLine;
  const footer = combinedLine ? t('decide.depth.combined.quickWith', { count: applied }) : credit ? t('decide.quick.footer') : '';
  const sizeInfo = useInfoSheet('size');
  const combinedInfo = useInfoSheet('combined');
  const metaRole = { ...textRole(pairing, 'label'), fontSize: fontSize.meta };

  return (
    <View style={styles.block}>
      <View style={[styles.result, { backgroundColor: colors.fill1 }]}>
        {/* CR-B04: the live region holds only the text, so "See it on credit" below stays its own focusable button. */}
        <View testID="quick-result-live" accessible accessibilityLiveRegion="polite" accessibilityLabel={settled} style={styles.live}>
          <Text numberOfLines={2} ellipsizeMode="tail" accessibilityLabel={spokenName} style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
            {fullName}
          </Text>
          {copy.chip ? (
            <View style={styles.chips}>
              <StateChip tone={copy.chip.tone as StateChipTone} label={chipLabel} />
            </View>
          ) : null}
          {sizeText ? (
            <InfoLabel term={sizeInfo.term} onInfo={sizeInfo.open} lineHeight={metaRole.lineHeight}>
              <Text style={{ ...metaRole, fontWeight: '600', color: colors.inkDim }}>{sizeText}</Text>
            </InfoLabel>
          ) : null}
          <Text maxFontSizeMultiplier={FIGURE_CAP} style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {lineText}
          </Text>
          {copy.monthly ? (
            <View style={styles.monthly}>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={FIGURE_MIN_FONT_SCALE}
                maxFontSizeMultiplier={FIGURE_CAP}
                accessibilityLabel={fmtCentsA11y(copy.monthly.amount)}
                style={{ ...textRole(pairing, 'heading'), color: colors.ink }}
              >
                {fmtCents(copy.monthly.amount)}
              </Text>
              <Text style={{ ...metaRole, color: colors.inkMuted }}>{caption}</Text>
            </View>
          ) : null}
          {basis ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{basis}</Text> : null}
        </View>
        {copy.tryCredit ? (
          <View style={styles.try}>
            <Pill label={t('decide.quick.tryCredit')} accessibilityLabel={t('decide.quick.tryCreditA11y')} variant="secondary" onPress={onTryCredit} />
          </View>
        ) : null}
      </View>
      {showFooter ? (
        <View style={styles.footer}>
          {footer !== '' ? (
            combinedLine ? (
              <View style={styles.footerText}>
                <InfoLabel term={combinedInfo.term} onInfo={combinedInfo.open} lineHeight={metaRole.lineHeight}>
                  <Text style={{ ...metaRole, color: colors.inkMuted }}>{footer}</Text>
                </InfoLabel>
              </View>
            ) : (
              <Text style={[styles.footerText, { ...metaRole, color: colors.inkMuted }]}>{footer}</Text>
            )
          ) : (
            <View style={styles.footerText} />
          )}
          {showPill ? <CombineToggle value={combine} onChange={onCombine} /> : null}
        </View>
      ) : null}
      {sizeInfo.sheet}
      {combinedInfo.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
  result: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  live: { gap: space.gapSm },
  chips: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, flexWrap: 'wrap' },
  monthly: { gap: 2 },
  try: { alignSelf: 'flex-start' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: space.touchMin, gap: space.gapMd },
  footerText: { flex: 1 },
});
