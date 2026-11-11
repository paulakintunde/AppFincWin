// 06-16 (G10a, D-27): change one of the user's money rules. A stepper in 1-point steps for the debt-payment share, an amount field
// for the investing and saving rules, a "Use this rule" switch, and "Save rule". It writes the EXISTING decide_settings line
// (dsr_line, investing_floor or saving_floor) through the existing settings mutation; no new table or column. Switching the rule
// off saves the line as null (the stored "no figure" value). Saving is a light haptic and a toast whose Undo puts the old value back.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { inverseSettingsPatch, useUpdateDecideSettings } from '@/data/mutations/decideSettings';
import type { DecideSettingsPatch, DecideSettingsRow } from '@/db/decideSettings';
import { useT } from '@/i18n';
import { stampSettingsPatch } from '@/features/decide/home/settingsPatch';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { Stepper } from '@/features/grow/ui/Stepper';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';

export type MoneyRule = 'debt' | 'investing' | 'saving';

const COLUMN = { debt: 'dsr_line', investing: 'investing_floor', saving: 'saving_floor' } as const satisfies Record<MoneyRule, keyof DecideSettingsPatch>;
const NAME = { debt: 'grow.lines.debt', investing: 'grow.lines.investing', saving: 'grow.lines.saving' } as const;

export interface LineSheetProps {
  rule: MoneyRule | null;
  userId: string | null;
  currency: string;
  settings: DecideSettingsRow | null;
  /** What the rule reads while it has no figure of its own: a whole percent for the debt rule, minor units for the others. */
  defaults: Record<MoneyRule, number>;
  onClose: () => void;
  /** Called after the write is queued, with a function that puts the previous value back. */
  onSaved: (undo: () => void) => void;
}

export function LineSheet(props: LineSheetProps) {
  return props.rule === null ? null : <LineForm {...props} rule={props.rule} />;
}

const validMoney = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n >= 0 && n <= MAX_INPUT_MINOR;

function LineForm({ rule, userId, currency, settings, defaults, onClose, onSaved }: LineSheetProps & { rule: MoneyRule }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const mutation = useUpdateDecideSettings(userId ?? '');
  const foreign = settings !== null && settings.currency !== null && settings.currency !== currency;
  const column = COLUMN[rule];

  // The figure as stored: a percent text, or minor units (blank when typed in another currency, as the builder reads it).
  const storedPercent = rule === 'debt' && settings !== null && settings.dsr_line !== null ? Number(settings.dsr_line) : null;
  const storedMoney = rule === 'debt' || settings === null || foreign ? null : (settings[column as 'investing_floor' | 'saving_floor'] ?? null);
  const stored = rule === 'debt' ? (storedPercent !== null && !Number.isNaN(storedPercent) ? storedPercent : null) : storedMoney;

  const [on, setOn] = useState(stored !== null);
  const [percent, setPercent] = useState(() => Math.min(100, Math.max(1, Math.round(stored ?? defaults.debt))));
  const [amount, setAmount] = useState<number | null>(() => (rule === 'debt' ? null : (stored ?? defaults[rule])));

  const canSave = userId !== null && (!on || rule === 'debt' || validMoney(amount));

  const onSave = () => {
    if (!canSave || userId === null) return;
    let patch: DecideSettingsPatch;
    if (!on) patch = { [column]: null };
    else if (rule === 'debt') patch = { dsr_line: String(percent) };
    else patch = { [column]: amount };
    // 06 review P4-WR-07: a figure typed in another currency clears every other money column and changes the currency in
    // the same write, so Undo puts back every column the write touched (the stored values, not re-stamped).
    const forward = stampSettingsPatch(patch, settings, currency);
    const previous = inverseSettingsPatch(forward, settings);
    mutation.update(forward);
    hapticLight();
    onClose();
    onSaved(() => mutation.update(previous));
  };

  const name = t(NAME[rule]);
  const title = t('grow.lines.change.title');
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('grow.common.cancel')} onCancel={onClose} />
      <SheetScroll>
        <View style={styles.body}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {name}
          </Text>
          <ToggleRow label={t('grow.lines.change.useRule')} value={on} onChange={setOn} />
          {on ? (
            rule === 'debt' ? (
              <Stepper
                value={percent}
                step={1}
                min={1}
                max={100}
                onChange={setPercent}
                valueText={`${percent}%`}
                accessibilityLabel={`${name}, ${percent}%`}
                decrementLabel={t('grow.lines.change.less')}
                incrementLabel={t('grow.lines.change.more')}
              />
            ) : (
              <MoneyInput value={amount} currency={currency} onChange={setAmount} label={name} accessibilityLabel={name} boxed />
            )
          ) : (
            <Text testID="line-off-note" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
              {t('grow.lines.change.useRuleOff')}
            </Text>
          )}
          <Pill label={t('grow.lines.change.save')} variant="primary" disabled={!canSave} onPress={onSave} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.groupGap, paddingBottom: space.groupGap },
});
