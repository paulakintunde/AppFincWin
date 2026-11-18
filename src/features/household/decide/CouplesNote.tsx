// 08.1-07 (UX-21, UI-SPEC section 3): the engine's `shared_money` caveat, for a joint account. Plain text, no state colour.
import React from 'react';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';

export interface CouplesNoteProps {
  /** The joint account's name. */
  account: string;
}

export function CouplesNote({ account }: CouplesNoteProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Text testID="couples-note" style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
      {t('household.members.partner.couplesNote', { account })}
    </Text>
  );
}
