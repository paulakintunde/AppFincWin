/**
 * 05.3-26 (UI-SPEC "Changes while viewing, saved plans"): the two change tiles and the saved-answer meta line.
 * Tiles show only when the model says the answer moved; the open-time tile announces politely once per from/to pair.
 */
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { verdictRowFor } from '@/engine/decide/v3';
import type { StoredSeenV3 } from '@/db/decideChecks';
import type { ChangeTile } from '@/features/decide/v3/model/answerChange';
import { useRecordContext } from '@/features/record/useRecordContext';
import { localDayOf } from '@/features/decide/v3/model/localDay';
import { useV3Format } from '@/features/decide/v3/shared/useV3Format';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { warnTint } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';

type Translate = (key: string, options?: Record<string, unknown>) => string;

function Tile({ tile, copyKey, announce }: { tile: ChangeTile; copyKey: string; announce: boolean }): React.JSX.Element | null {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const last = useRef<string | null>(null);
  const text = tile.show ? t(copyKey, { from: t(tile.fromKey), to: t(tile.toKey) }) : null;
  useEffect(() => {
    if (!announce || text === null || last.current === text) return;
    last.current = text;
    AccessibilityInfo.announceForAccessibility(text);
  }, [announce, text]);
  if (text === null) return null;
  return (
    <View accessible accessibilityLiveRegion="polite" style={[styles.tile, { backgroundColor: warnTint }]}>
      <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.s13_5, color: colors.warn1 }}>{text}</Text>
    </View>
  );
}

export function ChangedSinceOpenedTile({ tile }: { tile: ChangeTile }): React.JSX.Element | null {
  return <Tile tile={tile} copyKey="decide.v3.ui.answer.changedSinceOpened" announce />;
}

export function ChangedSinceSavedTile({ tile }: { tile: ChangeTile }): React.JSX.Element | null {
  return <Tile tile={tile} copyKey="decide.v3.ui.answer.changedSinceSaved" announce={false} />;
}

export interface SavedAnswerLineProps {
  stored: StoredSeenV3;
  /** The decided date, an ISO date or timestamp. */
  decidedAt: string;
  variant?: 'saved' | 'last';
}

export function SavedAnswerLine({ stored, decidedAt, variant = 'saved' }: SavedAnswerLineProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { timeZone } = useRecordContext();
  const { colors, pairing } = useTheme();
  const chip = t(verdictRowFor(stored.code, stored.variant).chipKey);
  const key = variant === 'last' ? 'decide.v3.ui.notReady.lastSaved' : 'decide.v3.ui.answer.savedAnswer';
  return (
    <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>
      {t(key, { chip, date: f.date(localDayOf(decidedAt, timeZone) ?? decidedAt.slice(0, 10)) })}
    </Text>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radii.card, padding: space.cardPad },
});
