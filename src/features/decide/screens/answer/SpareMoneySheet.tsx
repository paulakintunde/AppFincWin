/**
 * 06.1-84 (G-61-2, ask, don't block): "Your spare money hasn't been confirmed yet." used to send the person to Records, which has
 * no control for it (the Unspent step was removed with the old Decide screens in 06.1-36), so the ask could never be answered.
 * This sheet answers it where it is asked: it names the app's own figure from the records and lets the person say it is right or
 * type their own. The owner writes the figure (unspent_anchor, dated today) with Undo; the engine reads it on the next run.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';

export interface SpareMoneySheetProps {
  visible: boolean;
  /** The app's figure from the records (minor units), or null when it cannot be worked out. */
  figure: number | null;
  currency: string;
  formatMoney: (minor: number) => string;
  /** Saves the confirmed figure (minor units). */
  onConfirm: (figure: number) => void;
  onDismiss: () => void;
}

const within = (minor: number | null): number | null => (minor !== null && minor >= 0 && minor <= MAX_INPUT_MINOR ? minor : null);

export function SpareMoneySheet(props: SpareMoneySheetProps) {
  return props.visible ? <SpareMoneyForm {...props} /> : null;
}

function SpareMoneyForm({ figure, currency, formatMoney, onConfirm, onDismiss }: SpareMoneySheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [ownOpen, setOwnOpen] = useState(figure === null);
  const [own, setOwn] = useState<number | null>(null);
  const title = t('decide.screens.answer.spare.title');
  const body = { ...textRole(pairing, 'body'), color: colors.ink };
  const meta = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.body}>
        {figure === null ? (
          <Text style={body}>{t('decide.screens.answer.spare.noFigure')}</Text>
        ) : (
          <>
            <Text style={body} testID="spare-figure">
              {t('decide.screens.answer.spare.figure', { amount: formatMoney(figure) })}
            </Text>
            <Text style={meta}>{t('decide.screens.answer.spare.what')}</Text>
          </>
        )}
        {figure !== null ? (
          <View style={styles.actions}>
            <Pill variant="primary" label={t('decide.screens.answer.spare.right')} onPress={() => onConfirm(figure)} />
            {ownOpen ? null : <Pill variant="secondary" label={t('decide.screens.answer.spare.own')} onPress={() => setOwnOpen(true)} />}
          </View>
        ) : null}
        {ownOpen ? (
          <View style={styles.own}>
            <MoneyInput
              value={own}
              currency={currency}
              onChange={(m) => setOwn(within(m))}
              label={t('decide.screens.answer.spare.ownLabel')}
              accessibilityLabel={t('decide.screens.answer.spare.ownLabel')}
            />
            <View style={styles.actions}>
              <Pill
                variant={figure === null ? 'primary' : 'secondary'}
                label={t('decide.screens.answer.spare.useOwn')}
                disabled={own === null}
                onPress={() => {
                  if (own !== null) onConfirm(own);
                }}
              />
            </View>
          </View>
        ) : null}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.groupGap, paddingBottom: space.groupGap },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapMd },
  own: { gap: space.groupGap },
});
