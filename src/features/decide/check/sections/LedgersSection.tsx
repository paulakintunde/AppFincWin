/**
 * 05-15 section 2, "Where it lands": the five ledgers (04 D-38). 05-65 (D-76, R6) rebuilds it as stacked rows: a dot, the
 * ledger name and a Better / Worse / Same tag on line 1, the description under it, then "Now" and "After" side by side
 * (stacked under rule S). Words carry the direction beside the colour, never colour alone, and there is no arrow glyph.
 * Renders nothing without a resolved logged verdict.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { ACCENT_TINT_OPACITY } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { useShouldStack } from '../../ui/textFit';
import { LEDGER_DESC, LEDGER_LABEL } from '../../copy/codeMaps';
import { Dot, Note, assessmentOf, moneyOf, type SectionProps } from './sectionUi';

type Direction = 'better' | 'worse' | 'same';

interface LedgerRowProps {
  name: string;
  desc: string;
  directionWord: string;
  direction: Direction;
  now: string;
  after: string;
  a11yLabel: string;
  nowCaption: string;
  afterCaption: string;
}

function DirectionTag({ direction, word }: { direction: Direction; word: string }) {
  const { colors, pairing } = useTheme();
  const background = direction === 'worse' ? colors.dangerTint2 : colors.fill1;
  const textColor = direction === 'worse' ? colors.danger : direction === 'better' ? colors.accent : colors.inkDim;
  return (
    <View style={[styles.tag, { backgroundColor: background }]}>
      {direction === 'better' ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.pill }]}
        />
      ) : null}
      <Text scale="capped" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.tabLabel, color: textColor }}>
        {word}
      </Text>
    </View>
  );
}

function Figure({ caption, value }: { caption: string; value: string }) {
  const { colors, pairing } = useTheme();
  return (
    <View style={styles.figure}>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.tabLabel, color: colors.inkMuted }}>{caption}</Text>
      <Text
        scale="capped"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{ ...textRole(pairing, 'body'), color: colors.ink }}
      >
        {value}
      </Text>
    </View>
  );
}

function LedgerRow({ name, desc, directionWord, direction, now, after, a11yLabel, nowCaption, afterCaption }: LedgerRowProps) {
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack(Math.max(now.length, after.length));
  const dot = direction === 'better' ? colors.accent : direction === 'worse' ? colors.danger : colors.inkSoft1;
  return (
    <View accessible accessibilityLabel={a11yLabel} style={[styles.row, { borderTopColor: colors.fill2 }]}>
      <View style={styles.head}>
        <Dot color={dot} />
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink, flex: 1 }}>{name}</Text>
        <DirectionTag direction={direction} word={directionWord} />
      </View>
      <View style={styles.indent}>
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{desc}</Text>
        <View style={stacked ? styles.figuresStacked : styles.figures}>
          <Figure caption={nowCaption} value={now} />
          <Figure caption={afterCaption} value={after} />
        </View>
      </View>
    </View>
  );
}

export function LedgersBody(props: SectionProps) {
  const { computation, exact, currency } = props;
  const t = useT();
  const a = assessmentOf(computation);
  if (!a) return null;
  const fmt = moneyOf(exact, currency);
  return (
    <View>
      <Note>{t('decide.section.ledgersNote')}</Note>
      {a.ledgers.map((l) => {
        const direction = t(`decide.section.direction.${l.direction}`);
        const name = t(LEDGER_LABEL[l.code]);
        return (
          <LedgerRow
            key={l.code}
            name={name}
            desc={t(LEDGER_DESC[l.code])}
            directionWord={direction}
            direction={l.direction}
            now={fmt(l.now)}
            after={fmt(l.after)}
            nowCaption={t('decide.section.colNow')}
            afterCaption={t('decide.section.colAfter')}
            a11yLabel={t('decide.section.ledgerA11y', { ledger: name, now: fmt(l.now), after: fmt(l.after), direction })}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.gapSm, borderTopWidth: StyleSheet.hairlineWidth, gap: space.gapSm / 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  indent: { paddingLeft: 6 + space.gapMd, gap: space.gapSm / 2 },
  tag: { alignSelf: 'flex-start', flexShrink: 0, paddingHorizontal: space.gapMd, paddingVertical: 4, borderRadius: radii.pill, overflow: 'hidden' },
  figures: { flexDirection: 'row', gap: space.cardPad },
  figuresStacked: { gap: space.gapSm / 2 },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: space.gapSm, flexShrink: 1 },
});
