// REC-25, CONTEXT D-22, Confirmed Decision 11: the all-or-nothing home-currency confirm. The
// sheet only reports the server's atomic result; on failure it says nothing changed. It never
// claims stored amounts change (each line keeps the amount and currency it was entered in).
// A version conflict ('changed') keeps the sheet open with an inline line, like a rates failure.
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useChangeHomeCurrency } from '@/data/mutations/homeCurrency';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { queueToast, showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Sheet } from '@/ui/Sheet';

export interface HomeCurrencyChangeSheetProps {
  visible: boolean;
  next: string;
  onClose: () => void;
}

export function HomeCurrencyChangeSheet({ visible, next, onClose }: HomeCurrencyChangeSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const { change, pending } = useChangeHomeCurrency({
    userId: rc.userId ?? '',
    householdId: rc.householdId ?? '',
    currentHome: rc.homeCurrency,
  });
  const [failure, setFailure] = useState<'rates' | 'changed' | null>(null);

  const close = () => {
    setFailure(null);
    onClose();
  };

  const onConfirm = async () => {
    if (pending) return;
    setFailure(null);
    const result = await change(next);
    if (result.ok) {
      showToast({ kind: 'ordinary', text: { key: 'you.homeCurrency.done', params: { code: next } } });
      if (result.capsConverted > 0) {
        queueToast({ kind: 'ordinary', text: { key: 'you.homeCurrency.capsConverted', params: { code: next } } });
      }
      close();
      return;
    }
    setFailure(result.reason);
  };

  const title = t('you.homeCurrency.confirmTitle', { code: next });
  const body = { ...textRole(pairing, 'body'), color: colors.ink };

  return (
    <Sheet visible={visible} onDismiss={pending ? () => undefined : close} accessibilityLabel={title}>
      <View style={styles.column}>
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{title}</Text>
        <Text style={body}>{t('you.homeCurrency.confirmBody', { code: next })}</Text>
        <Text style={body}>{t('you.homeCurrency.keepsAmounts')}</Text>
        {failure !== null ? (
          <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
            {t(failure === 'changed' ? 'you.homeCurrency.changedElsewhere' : 'you.homeCurrency.failed')}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Pill label={t('you.homeCurrency.cancel')} variant="secondary" disabled={pending} onPress={close} />
          <Pill
            label={pending ? t('you.homeCurrency.fetching') : t('you.homeCurrency.confirm', { code: next })}
            variant="primary"
            disabled={pending}
            onPress={() => {
              void onConfirm();
            }}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.groupGap },
  actions: { flexDirection: 'row', gap: space.gapMd },
});
