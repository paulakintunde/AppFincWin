// 08-21 Screen 8b: "Yes, I got $84" opens this: one list of the receiver's own accounts and a Confirm. The receiver says
// which account the money arrived in, so the record lands in the right place. Only the person being paid sees it.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { AccountRow } from '@/db/rows';

export interface ArrivedInSheetProps {
  visible: boolean;
  /** The settle-up amount, already formatted. */
  amountText: string;
  accounts: readonly AccountRow[];
  busy?: boolean;
  /** A plain sentence when the last try was refused. */
  failure?: string | null;
  onConfirm: (accountId: string) => void;
  onClose: () => void;
}

export function ArrivedInSheet(props: ArrivedInSheetProps) {
  if (!props.visible) return null;
  return <ArrivedBody {...props} />;
}

function ArrivedBody({ amountText, accounts, busy = false, failure, onConfirm, onClose }: ArrivedInSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = picked ?? accounts[0]?.id ?? null;
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={t('household.settle.arrivedIn')} dismissible={!busy}>
      <SheetHeader title={t('household.settle.arrivedIn')} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{amountText}</Text>
        {accounts.length === 0 ? (
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('household.settle.noAccounts')}</Text>
        ) : (
          accounts.map((a) => (
            <Row key={a.id} label={a.name} sublabel={a.currency} selected={a.id === chosen} onPress={() => setPicked(a.id)} />
          ))
        )}
        {failure ? (
          <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
            {failure}
          </Text>
        ) : null}
        <View style={styles.cta}>
          <Pill
            label={t('household.settle.confirm')}
            variant="primary"
            disabled={chosen === null}
            pending={busy}
            onPress={() => {
              if (chosen !== null) onConfirm(chosen);
            }}
          />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.tight },
  cta: { marginTop: step.row },
});
