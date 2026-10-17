/**
 * 05-27 (D-03, D-04): the sheet behind "Add rough figures" and the rough state's "Edit". Two money fields, saved as
 * integer minor units through the 05-19 settings mutation (never `seeded`, which the server manages). The form mounts
 * per opening so each field starts from the stored figure. Cancel never asks; a swipe, back or backdrop on a dirty
 * sheet asks "Discard changes?" through the shared Sheet (03 D-26).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useUpdateDecideSettings } from '@/data/mutations/decideSettings';
import type { DecideSettingsRow } from '@/db/decideSettings';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useIsDirty } from '@/ui/useIsDirty';
import { MAX_INPUT_MINOR } from '../snapshot/checkInputs';
import { MoneyInput } from '../ui/MoneyInput';

export interface RoughFiguresSheetProps {
  visible: boolean;
  userId: string | null;
  currency: string;
  settings: DecideSettingsRow | null;
  onClose: () => void;
}

const validAmount = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n > 0 && n <= MAX_INPUT_MINOR;

export function RoughFiguresSheet(props: RoughFiguresSheetProps) {
  return props.visible ? <RoughFiguresForm {...props} /> : null;
}

interface Fields {
  income: number | null;
  spending: number | null;
}

function RoughFiguresForm({ userId, currency, settings, onClose }: RoughFiguresSheetProps) {
  const t = useT();
  const mutation = useUpdateDecideSettings(userId ?? '');
  // Figures stored in another currency are not shown as if they were this one's.
  const sameCurrency = settings !== null && (settings.currency === null || settings.currency === currency);
  const [start] = useState<Fields>(() => ({
    income: sameCurrency ? (settings?.rough_income ?? null) : null,
    spending: sameCurrency ? (settings?.rough_spending ?? null) : null,
  }));
  const [value, setValue] = useState<Fields>(start);
  const dirty = useIsDirty(start, value);
  const canSave = userId !== null && validAmount(value.income) && validAmount(value.spending);
  const title = t('decide.rough.title');

  const save = () => {
    if (userId === null || !validAmount(value.income) || !validAmount(value.spending)) return;
    mutation.update({ rough_income: value.income, rough_spending: value.spending, currency });
    onClose();
  };

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('decide.rough.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <MoneyInput
          value={value.income}
          currency={currency}
          onChange={(income) => setValue((v) => ({ ...v, income }))}
          label={t('decide.rough.in')}
          accessibilityLabel={t('decide.rough.in')}
        />
        <MoneyInput
          value={value.spending}
          currency={currency}
          onChange={(spending) => setValue((v) => ({ ...v, spending }))}
          label={t('decide.rough.out')}
          accessibilityLabel={t('decide.rough.out')}
        />
        <View style={styles.action}>
          <Pill label={t('decide.rough.save')} variant="primary" disabled={!canSave} onPress={save} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd },
  action: { marginTop: space.gapSm },
});
