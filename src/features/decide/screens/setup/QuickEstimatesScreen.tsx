// 06.1-39 (D39, UX-11, UX-05, "ask, don't block"): a first answer from three estimates, before records exist. Comes in, bills and
// everyday spending are typed as whole amounts in minor units; "See the answer now" writes rough_income = in, rough_spending =
// bills + everyday and rough_as_of = today (saving, debt and invest are left as they are), then returns to the answer. The answer
// frame, not this screen, says the answer rests on quick estimates.
// 06.1-65 (CC-7): the write is the undoable setup save, so it toasts "Quick estimates saved." with Undo (Undo puts the old rough
// figures back). (CN-5 a): opened from Records with no check in view (`mode=save`), the button says "Save" and the screen goes back
// to Records instead of landing on Decide home with no answer; otherwise the route's onDone sends the person on as before.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import { currencyCode, minorUnits } from '@/engine/money';
import { useT } from '@/i18n';
import { useRecordContext } from '@/features/record/useRecordContext';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { showToast } from '@/state/undoToast';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { MoneyInput } from '@/ui/MoneyInput';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { useSettledLabel } from '@/ui/useSettledLabel';
import { MAX_INPUT_MINOR } from '../../snapshot/checkInputs';
import { stampSettingsPatch } from '../../settingsPatch';
import type { DecideSettingsPatch, DecideSettingsRow } from '@/db/decideSettings';
import { useLeaveItem } from './items/SetupItemFrame';

/** 06.1-65 (CN-5 a): Records opens this screen with `mode=save` when no check is in view. */
export const QUICK_SAVE_MODE = 'save';

/** Quiet time before a screen reader reads the live line again, so typing is not read out digit by digit. */
const LIVE_SETTLE_MS = 700;

const valid = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n >= 0 && n <= MAX_INPUT_MINOR;

export interface QuickEstimatesScreenProps {
  currency: string;
  /** Today's local date (YYYY-MM-DD). */
  today: string;
  /** The stored settings, so a figure typed in another currency clears the rest in the same patch (CR-B01). */
  stored: DecideSettingsRow | null;
  /**
   * No longer called (06.1-65 CC-7): the screen writes through the undoable setup save so the toast can offer Undo. Kept optional
   * while QuickEstimatesRoute (06.1-64's file this wave) still passes it; drop it there next.
   */
  onSave?: (patch: DecideSettingsPatch) => void;
  /** Called after the save, outside save mode; the route sends the person to the answer or home. */
  onDone: () => void;
}

export function QuickEstimatesScreen({ currency, today, stored, onDone }: QuickEstimatesScreenProps): React.JSX.Element {
  const t = useT();
  const rc = useRecordContext();
  const saver = useSaveSetupStep(rc.userId ?? '');
  const leave = useLeaveItem();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const saveMode = mode === QUICK_SAVE_MODE;
  const { colors, pairing } = useTheme();
  const money = useMoneyFormatter(false, currency);
  const [income, setIncome] = useState<number | null>(null);
  const [bills, setBills] = useState<number | null>(null);
  const [everyday, setEveryday] = useState<number | null>(null);

  const spending = valid(bills) && valid(everyday) ? bills + everyday : null;
  // T-06.1-39-01: the sum must also be a positive figure within the input bound.
  const ready = valid(income) && spending !== null && spending > 0 && spending <= MAX_INPUT_MINOR;
  const fmt = (n: number): string => money.formatMoney({ amount: minorUnits(n), currency: currencyCode(currency) });
  const left = ready ? income - spending : null;
  const liveText =
    left === null
      ? ''
      : left >= 0
        ? t('decide.screens.setup.quick.live', { left: fmt(left) })
        : t('decide.screens.setup.quick.liveShort', { short: fmt(-left) });
  const settled = useSettledLabel(liveText, left === null ? 'none' : left >= 0 ? 'left' : 'short', LIVE_SETTLE_MS);

  const see = () => {
    if (!ready) return;
    if (rc.userId !== null) {
      const patch = stampSettingsPatch({ rough_income: income, rough_spending: spending, rough_as_of: today }, stored, currency);
      const saved = saver.save({ stepTitle: t('decide.screens.setup.quick.stepName'), patch });
      showToast({ kind: 'ordinary', text: { key: 'decide.screens.setup.quick.saved' }, stepId: saved?.stepId ?? null });
    }
    if (saveMode) leave();
    else onDone();
  };

  const body = { ...textRole(pairing, 'body'), color: colors.inkDim };
  return (
    <DetailScreen title={t('decide.screens.setup.quick.title')}>
      <View style={styles.block}>
        <Text style={body}>{t('decide.screens.setup.quick.sub')}</Text>
        <MoneyInput value={income} currency={currency} onChange={setIncome} label={t('decide.screens.setup.quick.income')} accessibilityLabel={t('decide.screens.setup.quick.income')} />
        <MoneyInput value={bills} currency={currency} onChange={setBills} label={t('decide.screens.setup.quick.bills')} accessibilityLabel={t('decide.screens.setup.quick.bills')} />
        <MoneyInput value={everyday} currency={currency} onChange={setEveryday} label={t('decide.screens.setup.quick.everyday')} accessibilityLabel={t('decide.screens.setup.quick.everyday')} />
        <View accessibilityLiveRegion="polite" testID="quick-live" style={styles.live}>
          {liveText !== '' ? (
            <Text accessibilityLabel={settled} style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
              {liveText}
            </Text>
          ) : null}
        </View>
        <Pill variant="primary" label={saveMode ? t('decide.screens.setupOthers.records.quickSave') : t('decide.screens.setup.quick.see')} disabled={!ready} onPress={see} />
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.screens.setup.quick.foot')}</Text>
        <Text testID="quick-footer" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
          {t('legal.decideAnswer.footer')}
        </Text>
      </View>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapMd, paddingTop: space.gapSm },
  live: { minHeight: 24 },
});
