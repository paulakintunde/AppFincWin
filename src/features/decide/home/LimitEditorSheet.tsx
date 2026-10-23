/**
 * 05-27 (D-14, DCU-03): the short-form editor behind each "Lines you will not cross" row. One field (money, % or ×),
 * an info line, "Use the default" (blanks the line, writes null) and "Save limit". Saving writes the one column through
 * the 05-19 settings mutation (never `seeded`, which the server manages); a money figure also stamps the currency and,
 * when that currency differs from the stored one, clears the other money columns (CR-B01). Money is integer
 * minor units via MoneyInput; the debt line is kept as text and checked against the stored-column grammar before
 * anything is queued, so a queued write can never be refused by the server (05-03 dsr_line check).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useUpdateDecideSettings } from '@/data/mutations/decideSettings';
import type { DecideSettingsPatch, DecideSettingsRow } from '@/db/decideSettings';
import type { Steadiness } from '@/engine/decide';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { useIsDirty } from '@/ui/useIsDirty';
import { Box, Label, type Money } from '../check/steps/stepUi';
import { monthsText } from '../copy/depthVerdictCopy';
import { MAX_INPUT_MINOR } from '../snapshot/checkInputs';
import type { SnapshotResult } from '../snapshot/types';
import { MoneyInput } from '../ui/MoneyInput';
import { useInfoSheet } from '../ui/useInfoSheet';
import type { InfoKey } from '../copy/infoTerms';
import { stampSettingsPatch } from './settingsPatch';
import { RateInput } from '../ui/RateInput';

export type LimitKey = 'reserve' | 'dsr' | 'unsecured' | 'investing' | 'saving';

/** The 05-03 column check on decide_settings.dsr_line: up to 3 digits and 4 decimals. */
export const DSR_LINE_RE = /^\d{1,3}(\.\d{1,4})?$/;
const MAX_MULTIPLE = 120; // the builder's MAX_UNSECURED_MULTIPLE: a larger stored value would be reset to the default

/** D-70: the ⓘ on the editor title is the one on the line it edits. */
export const LIMIT_INFO_KEY = {
  reserve: 'reserve',
  dsr: 'dsrLine',
  unsecured: 'unsecuredMultiple',
  investing: 'investingFloor',
  saving: 'savingFloor',
} as const satisfies Record<LimitKey, InfoKey>;

const COLUMN = {
  reserve: 'reserve',
  dsr: 'dsr_line',
  unsecured: 'unsecured_multiple',
  investing: 'investing_floor',
  saving: 'saving_floor',
} as const satisfies Record<LimitKey, keyof DecideSettingsPatch>;

export interface LimitEditorSheetProps {
  limit: LimitKey | null;
  userId: string | null;
  currency: string;
  settings: DecideSettingsRow | null;
  source: SnapshotResult | null;
  whole: Money;
  /** D-25: the engine's cushion default in half-months with the steadiness behind it; null when the line is typed or unknown. */
  cushion?: { halfMonths: number; steadiness: Steadiness } | null;
  onClose: () => void;
}

export function LimitEditorSheet(props: LimitEditorSheetProps) {
  // The form mounts per opening so the field starts from the stored value.
  return props.limit !== null ? <LimitForm {...props} limit={props.limit} /> : null;
}

interface Fields {
  money: number | null;
  text: string;
}

const validMoney = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n >= 0 && n <= MAX_INPUT_MINOR;

function LimitForm({ limit, userId, currency, settings, source, whole, cushion = null, onClose }: LimitEditorSheetProps & { limit: LimitKey }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const mutation = useUpdateDecideSettings(userId ?? '');
  const lineInfo = useInfoSheet(LIMIT_INFO_KEY[limit]);
  const foreign = settings !== null && settings.currency !== null && settings.currency !== currency;

  const [start] = useState<Fields>(() => {
    const s = settings;
    if (s === null) return { money: null, text: '' };
    const money = foreign ? null : limit === 'reserve' ? s.reserve : limit === 'investing' ? s.investing_floor : limit === 'saving' ? s.saving_floor : null;
    const text = limit === 'dsr' ? (s.dsr_line ?? '') : limit === 'unsecured' ? (s.unsecured_multiple === null ? '' : String(s.unsecured_multiple)) : '';
    return { money, text };
  });
  const [value, setValue] = useState<Fields>(start);
  const dirty = useIsDirty(start, value);

  const isMoney = limit === 'reserve' || limit === 'investing' || limit === 'saving';
  let canSave = userId !== null;
  if (isMoney) canSave = canSave && validMoney(value.money);
  else if (limit === 'dsr') canSave = canSave && DSR_LINE_RE.test(value.text);
  else canSave = canSave && /^\d{1,3}$/.test(value.text) && Number(value.text) <= MAX_MULTIPLE;

  const name = t(`decide.lines.${limit}.name` as const);

  let info: string;
  if (limit === 'reserve' && source !== null) {
    info = t('decide.lines.reserve.info', { cash: whole(source.cash), count: source.meta.accountCount });
    if (cushion !== null) {
      const because = t(`decide.depth.cushion.because.${cushion.steadiness}` as const);
      info = `${info} ${t('decide.depth.cushion.editorInfo', { months: monthsText(cushion.halfMonths), because })}`;
    }
  } else if ((limit === 'investing' || limit === 'saving') && source !== null && source.kind === 'logged') {
    const amount = limit === 'investing' ? source.snapshot.monthlyInvesting : source.snapshot.monthlySaving;
    info = t(`decide.lines.${limit}.info` as const, { amount: whole(amount) });
  } else {
    info = t(`decide.lines.${limit}.desc` as const);
  }

  const write = (patch: DecideSettingsPatch) => {
    if (userId === null) return;
    mutation.update(stampSettingsPatch(patch, settings, currency));
    onClose();
  };

  const save = () => {
    if (!canSave) return;
    const column = COLUMN[limit];
    if (isMoney) {
      if (!validMoney(value.money)) return;
      write({ [column]: value.money });
    } else if (limit === 'dsr') {
      if (!DSR_LINE_RE.test(value.text)) return;
      write({ dsr_line: value.text });
    } else {
      write({ unsecured_multiple: Number(value.text) });
    }
  };

  const useDefault = () => write({ [COLUMN[limit]]: null });

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={name} dirty={dirty}>
      <SheetHeader title={name} cancelLabel={t('decide.lines.cancel')} onCancel={onClose} titleAccessory={lineInfo.button()} />
      <SheetScroll contentContainerStyle={styles.column}>
        {isMoney ? (
          <MoneyInput
            value={value.money}
            currency={currency}
            onChange={(money) => setValue((v) => ({ ...v, money }))}
            label={name}
            accessibilityLabel={name}
          />
        ) : limit === 'dsr' ? (
          <RateInput
            value={value.text}
            onChange={(text) => setValue((v) => ({ ...v, text }))}
            label={name}
            accessibilityLabel={name}
          />
        ) : (
          <>
            <Label>{name}</Label>
            <Box
              numeric
              value={value.text}
              onChangeText={(text) => setValue((v) => ({ ...v, text: text.replace(/\D/g, '') }))}
              accessibilityLabel={name}
              maxLength={3}
            />
          </>
        )}
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{info}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('decide.lines.useDefault')}
          onPress={useDefault}
          style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.lines.useDefault')}</Text>
        </Pressable>
        <Pill label={t('decide.lines.save')} variant="primary" disabled={!canSave} onPress={save} />
      </SheetScroll>
      {lineInfo.sheet}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
