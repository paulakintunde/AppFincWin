/**
 * 05.3-23 (UI-SPEC Home, Envelopes): the first four envelope tiles in two columns (one under rule S), "All envelopes (n)"
 * past four, and the empty state with "Add an envelope". A tile opens the Envelopes screen. Names wrap; the amount is one
 * line that scales to fit.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { Text } from '@/ui/Text';
import { PotSheet } from '../../pots/PotSheet';
import { useShouldStack } from '../../ui/textFit';
import { envelopeTiles } from '../model/envelopeTiles';
import { ENVELOPES_HREF } from '../nav/hrefs';
import { useV3Format } from '../shared/useV3Format';

const TILE_RADIUS = 16;
const TILE_PAD_V = 12;
const TILE_PAD_H = 14;
const AMOUNT_MIN_FONT_SCALE = 0.8;

export interface EnvelopeTile {
  id: string;
  name: string;
  /** Saved so far, integer minor units. */
  amount: number;
}

export interface EnvelopeGridProps {
  envelopes: readonly EnvelopeTile[];
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function EnvelopeGrid({ envelopes }: EnvelopeGridProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors, pairing } = useTheme();
  const stack = useShouldStack();
  const [addOpen, setAddOpen] = useState(false);
  const K = 'decide.v3.ui.home.';
  const { tiles, more, empty } = envelopeTiles(envelopes);
  const open = (): void => pushOnce(ENVELOPES_HREF);

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.inkDim }}>
        {t(`${K}envelopes`)}
      </Text>
      {empty ? (
        <View style={styles.empty}>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t(`${K}noEnvelopes`)}</Text>
          <Pressable accessibilityRole="button" onPress={() => setAddOpen(true)} style={styles.link}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textDecorationLine: 'underline' }}>{t(`${K}addEnvelope`)}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.grid}>
            {tiles.map((e) => (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                onPress={open}
                style={({ pressed }) => [
                  styles.tile,
                  stack ? styles.tileFull : styles.tileHalf,
                  { backgroundColor: colors.surface, borderColor: colors.line2, opacity: pressed ? PRESSED_OPACITY : 1 },
                ]}
              >
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{e.name}</Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={AMOUNT_MIN_FONT_SCALE}
                  style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}
                >
                  {f.money(e.amount)}
                </Text>
              </Pressable>
            ))}
          </View>
          {more > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t(`${K}allEnvelopes`, { count: more })} onPress={open} style={styles.link}>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textDecorationLine: 'underline' }}>
                {t(`${K}allEnvelopes`, { count: more })}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
      <PotSheet visible={addOpen} pot={null} onClose={() => setAddOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.gapMd },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  tile: {
    borderWidth: 1,
    borderRadius: TILE_RADIUS,
    paddingVertical: TILE_PAD_V,
    paddingHorizontal: TILE_PAD_H,
    gap: 2,
    minHeight: space.touchMin,
    justifyContent: 'center',
  },
  tileHalf: { flexGrow: 1, flexBasis: '45%' },
  tileFull: { flexBasis: '100%' },
  empty: { gap: space.gapSm, alignItems: 'flex-start' },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
