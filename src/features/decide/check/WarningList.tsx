/**
 * 05-15: the warning cards under the verdict (D-05). Card-reason cards first, then the engine's warnings in the order it
 * returned them (shortfall descending, at most six with cash_dip), then the neutral debt-rate fact. Nothing here decides;
 * it renders what warningCard / cardReasonCards return. Renders nothing without a verdict.
 *
 * 05-64 (D-74, R2): `WarningRows` renders the same cards as rows inside the "What breaks" fold, and `WarningList` can render
 * the notices only (`warnings={false}`) so step 3 keeps them above the folds.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Assessment, FirstRead, Verdict } from '@/engine/decide';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { cardReasonCards, warningCard } from '../copy/warningCopy';
import { cashTightFactCopy } from '../copy/depthVerdictCopy';
import { promoCopy } from '../copy/depthInputsCopy';
import { percentText } from '../copy/percentText';
import { ref, type Fmt, type WarnCard } from '../copy/types';
import type { InfoKey } from '../copy/infoTerms';
import { WarningCard } from '../ui/WarningCard';
import { useShouldStack } from '../ui/textFit';
import { useInfoSheet, type InfoSheetHandle } from '../ui/useInfoSheet';
import { InfoTitle } from './InfoTitle';
import { refText, type Translate } from './refText';

const MAX_WARNINGS = 6;
const DOT = 8;

export interface WarningListProps {
  verdict: Verdict | null;
  fmt: Fmt;
  /** D-94: amounts as a screen reader speaks them; the visible text is unchanged. */
  fmtA11y?: Fmt;
  fmtDate: (localDate: string) => string;
  /** D-59: how many of the other open checks the combined position applies (picks the stacked wording). */
  stackedApplied?: number;
  /** 05-64: false renders only the facts and the deferred-interest notice (the warnings sit in the fold). Default true. */
  warnings?: boolean;
}

/** The cards of a resolved first read (D-11): month and cash only, from the rough figures. */
function firstReadCards(fr: FirstRead, fmt: Fmt): WarnCard[] {
  if (fr.state === 'missing') return [];
  return fr.warnings.map((w): WarnCard => {
    if (w.code === 'month') {
      return {
        title: ref('decide.warn.monthTitleNoPause'), // D-105: the rough first read has no saving or investing to pause
        value: ref('decide.warn.monthValue', { amount: fmt(w.shortfall) }),
        body: [ref('decide.warn.monthBodyNoPause', { short: fmt(w.shortfall) })],
        tone: 'hard',
      };
    }
    return {
      title: ref('decide.warn.cashTitle'),
      value: ref('decide.warn.cashValue', { amount: fmt(w.shortfall) }),
      body: [ref('decide.warn.cashBody', { cushion: fmt(fr.roughCushion), day: fmt(fr.dayOne), cashAfter: fmt(fr.cashAfter) })],
      tone: 'soft',
    };
  });
}

/** Every card the "What breaks" fold lists, in the order the engine returned them (card reasons first). */
export function warnCardsOf(
  verdict: Verdict | null,
  firstRead: FirstRead | null | undefined,
  fmt: Fmt,
  fmtDate: (localDate: string) => string,
): WarnCard[] {
  if (verdict) {
    const reasons = cardReasonCards(verdict, fmt);
    const a: Assessment | null = verdict.state === 'missing' ? null : verdict;
    const engine: WarnCard[] = a ? a.warnings.slice(0, MAX_WARNINGS).map((w) => warningCard(w, a, fmt, fmtDate)) : [];
    return [...reasons, ...engine];
  }
  return firstRead ? firstReadCards(firstRead, fmt) : [];
}

/** D-70 / R3 "Where": the warning rows that explain a line. */
function infoKeyOf(title: string): InfoKey | null {
  if (title === 'decide.warn.dsrTitle') return 'dsrLine';
  if (title === 'decide.warn.oweTitle') return 'unsecuredMultiple';
  if (title.startsWith('decide.warn.invTitle')) return 'investingFloor';
  return null;
}

export interface WarningRowsProps {
  verdict: Verdict | null;
  firstRead?: FirstRead | null;
  fmt: Fmt;
  /** D-94: amounts as a screen reader speaks them; the visible text is unchanged. */
  fmtA11y?: Fmt;
  fmtDate: (localDate: string) => string;
}

/** D-94: a warning card's whole label with every amount spoken by currency name. */
function spokenCardLabel(t: Translate, spoken: WarnCard): string {
  const title = refText(t, spoken.title);
  const description = spoken.body.map((b) => refText(t, b)).join(' ');
  return spoken.value ? `${title}, ${refText(t, spoken.value)}. ${description}` : `${title}. ${description}`;
}

export function WarningRows({ verdict, firstRead, fmt, fmtA11y = fmt, fmtDate }: WarningRowsProps) {
  const t = useT() as Translate;
  const cards = warnCardsOf(verdict, firstRead, fmt, fmtDate);
  const spokenCards = warnCardsOf(verdict, firstRead, fmtA11y, fmtDate);
  if (cards.length === 0) return null;
  return (
    <View>
      {cards.map((c, i) => {
        const infoKey = infoKeyOf(c.title.key);
        const props = {
          first: i === 0,
          tone: c.tone,
          title: refText(t, c.title),
          value: c.value ? refText(t, c.value) : '',
          body: c.body.map((b) => refText(t, b)),
          a11yLabel: spokenCards[i] ? spokenCardLabel(t, spokenCards[i]) : undefined,
        };
        const key = `${c.title.key}-${i}`;
        return infoKey ? <InfoWarningRow key={key} infoKey={infoKey} {...props} /> : <WarningRow key={key} {...props} />;
      })}
    </View>
  );
}

interface RowProps {
  first: boolean;
  tone: 'hard' | 'soft';
  title: string;
  value: string;
  body: string[];
  a11yLabel?: string;
}

function InfoWarningRow({ infoKey, ...rest }: RowProps & { infoKey: InfoKey }) {
  const info = useInfoSheet(infoKey);
  return <WarningRow {...rest} info={info} />;
}

function WarningRow({ first, tone, title, value, body, a11yLabel, info }: RowProps & { info?: InfoSheetHandle }) {
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack(value.length);
  const color = tone === 'hard' ? colors.danger : colors.warn1;
  const titleRole = textRole(pairing, 'label');
  const metaRole = { ...textRole(pairing, 'label'), fontSize: fontSize.meta };
  const description = body.join(' ');
  const label = value ? `${title}, ${value}. ${description}` : `${title}. ${description}`;
  const titleText = <Text style={{ ...titleRole, fontSize: fontSize.s13_5, color }}>{title}</Text>;
  const valueText = value ? (
    <Text scale="capped" style={{ ...metaRole, color, textAlign: stacked ? 'left' : 'right' }}>
      {value}
    </Text>
  ) : null;
  return (
    <View
      accessible
      accessibilityLabel={a11yLabel ?? label}
      accessibilityActions={info ? [info.aboutAction] : undefined}
      onAccessibilityAction={info?.onAccessibilityAction}
      style={[styles.row, first ? null : { borderTopWidth: 1, borderTopColor: colors.fill2 }]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[styles.dot, { backgroundColor: color, marginTop: Math.max(0, (titleRole.lineHeight - DOT) / 2) }]}
      />
      <View style={styles.column}>
        <View style={styles.line}>
          <View style={styles.title}>
            {info ? (
              <InfoTitle info={info} lineHeight={titleRole.lineHeight}>
                {titleText}
              </InfoTitle>
            ) : (
              titleText
            )}
          </View>
          {stacked ? null : valueText}
        </View>
        {stacked ? valueText : null}
        {description ? (
          <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.meta, lineHeight: fontSize.meta * 1.4, color: colors.inkDim }}>
            {description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The deferred-interest notice (D-42), with its ⓘ in the title. */
function Notice({ title, body }: { title: string; body: string }) {
  const { colors, pairing } = useTheme();
  const info = useInfoSheet('deferredInterest');
  return (
    <View style={[styles.fact, { borderColor: colors.line2, backgroundColor: colors.surface }]}>
      <InfoTitle info={info} lineHeight={textRole(pairing, 'label').lineHeight}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{title}</Text>
      </InfoTitle>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim }}>{body}</Text>
    </View>
  );
}

export function WarningList({ verdict, fmt, fmtA11y = fmt, fmtDate, stackedApplied = 0, warnings = true }: WarningListProps) {
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  if (!verdict) return null;
  const cards = warnings ? warnCardsOf(verdict, null, fmt, fmtDate) : [];
  const spokenCards = warnings ? warnCardsOf(verdict, null, fmtA11y, fmtDate) : [];
  const a: Assessment | null = verdict.state === 'missing' ? null : verdict;
  const fact = a?.facts.find((f) => f.code === 'debt_rate_exceeds_return');
  const tight = a?.facts.find((f) => f.code === 'cash_tight_before_payday');
  const tightRef = tight && tight.code === 'cash_tight_before_payday' ? cashTightFactCopy(tight, stackedApplied, fmt, fmtDate) : null;
  const tightBody = tightRef ? refText(t, tightRef) : null;
  const tightRefSpoken = tight && tight.code === 'cash_tight_before_payday' ? cashTightFactCopy(tight, stackedApplied, fmtA11y, fmtDate) : null;
  const tightSpoken = tightRefSpoken ? refText(t, tightRefSpoken) : null;
  // D-42: a neutral notice, never a warning; the engine reports the charge only when the toggle is on.
  const promo = a?.plan.promo ?? null;
  const notice = promo && promo.deferredInterestCode === 'deferred_interest_charged' ? promoCopy(null, '', promo, null, fmt, fmt).notice : null;
  if (cards.length === 0 && !fact && !tightBody && !notice) return null;
  const factBody = fact && fact.code === 'debt_rate_exceeds_return' ? t('decide.warn.factBody', { apr: percentText(fact.debtApr), rate: percentText(fact.projectionReturn) }) : null;
  return (
    <View style={styles.list}>
      {cards.map((c, i) => (
        <WarningCard
          key={`${c.title.key}-${i}`}
          tone={c.tone}
          title={refText(t, c.title)}
          value={c.value ? refText(t, c.value) : ''}
          body={c.body.map((b) => refText(t, b))}
          a11yLabel={spokenCards[i] ? spokenCardLabel(t, spokenCards[i]) : undefined}
        />
      ))}
      {factBody ? (
        <View
          accessible
          style={[styles.fact, { borderColor: colors.line2, backgroundColor: colors.surface }]}
          accessibilityLabel={`${t('decide.warn.factTitle')}. ${factBody}`}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t('decide.warn.factTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim }}>{factBody}</Text>
        </View>
      ) : null}
      {tightBody ? (
        <View accessible style={[styles.fact, { borderColor: colors.line2, backgroundColor: colors.surface }]} accessibilityLabel={tightSpoken ?? tightBody}>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim }}>{tightBody}</Text>
        </View>
      ) : null}
      {notice ? <Notice title={refText(t, notice.title)} body={refText(t, notice.body)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.gapSm },
  fact: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPad, gap: space.gapSm },
  row: { flexDirection: 'row', gap: space.gapSm, paddingVertical: space.rowPadDense },
  dot: { width: DOT, aspectRatio: 1, borderRadius: DOT / 2 },
  column: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: space.gapMd },
  title: { flex: 1 },
});
