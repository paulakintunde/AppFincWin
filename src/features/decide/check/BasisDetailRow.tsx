/**
 * 05-41 (D-29, D-37, D-40): the one optional basis detail row under the verdict card. Meta size, inkMuted, ' · '-joined,
 * one line at default text. Absent when empty. With a card minimum item and a handler, the row opens the card terms.
 */
import React from 'react';
import { Pressable } from 'react-native';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import type { CopyRef } from '../copy/types';
import { useInfoSheet } from '../ui/useInfoSheet';
import { InfoTitle } from './InfoTitle';
import { refText, type Translate } from './refText';

const CARD_MIN_KEY = 'decide.depth.cardMin.basis';
const PROVISIONAL_KEY = 'decide.depth.currency.provisional';

export interface BasisDetailRowProps {
  items: readonly CopyRef[];
  onPressCardMinimum?: () => void;
}

export function BasisDetailRow({ items, onPressCardMinimum }: BasisDetailRowProps) {
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  // D-70: the provisional-rate item carries its own explanation, dated by the stored rate
  const provisional = items.find((i) => i.key === PROVISIONAL_KEY && i.params?.date !== undefined);
  const info = useInfoSheet('provisionalRate', { provisionalRate: { date: String(provisional?.params?.date ?? '') } });
  if (items.length === 0) return null;
  const text = items.map((i) => refText(t, i)).join(' · ');
  const body = (
    <Text numberOfLines={1} style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
      {text}
    </Text>
  );
  const opens = onPressCardMinimum !== undefined && items.some((i) => i.key === CARD_MIN_KEY);
  const lineHeight = textRole(pairing, 'label').lineHeight;
  const withInfo = (node: React.ReactNode): React.JSX.Element =>
    provisional === undefined ? <>{node}</> : <InfoTitle info={info} lineHeight={lineHeight}>{node}</InfoTitle>;
  if (!opens) return withInfo(body);
  return withInfo(
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityHint={t('decide.section.asCardMinimumHint')}
      onPress={onPressCardMinimum}
      style={({ pressed }) => ({ minHeight: space.touchMin, justifyContent: 'center', opacity: pressed ? PRESSED_OPACITY : 1 })}
    >
      {body}
    </Pressable>
  );
}
