// 06.1-39 (D39, UX-11, UX-05, "ask, don't block"): a first answer from three estimates, before records exist. Comes in, bills and
// everyday spending are typed as whole amounts in minor units; "See the answer now" writes rough_income = in, rough_spending =
// bills + everyday and rough_as_of = today (saving, debt and invest are left as they are), then returns to the answer. The answer
// frame, not this screen, says the answer rests on quick estimates.
// 06.1-65 (CC-7): the write is the undoable setup save, so it toasts "Quick estimates saved." with Undo (Undo puts the old rough
// figures back). (CN-5 a): opened from Records with no check in view (`mode=save`), the button says "Save" and the screen goes back
// to Records instead of landing on Decide home with no answer; otherwise the route's onDone sends the person on as before.
// 06.1-58 (A-SU-6, UX-11): the fields start from the saved rough figures (rough_income; rough_spending in the bills field with
// everyday at 0, since only the sum is stored), each has the currency prefix, the title is a display headline, the line under the
// disabled button names the first figure still missing, and taps land with the keyboard open (keyboardShouldPersistTaps).
// 06.1-60 (G-10, owner decision 4, D39): the headline and the three questions stay in view, with "Round numbers are fine." as the
// fields' hint; "Before your records are ready." and "Quick estimates count only until…" open under a Why?.
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
import type { DecideSettingsRow } from '@/db/decideSettings';
import { NeedLine } from '../ui/NeedLine';
import { WhyLine } from '../ui/WhyLine';
import { useLeaveItem } from './items/SetupItemFrame';

/** 06.1-65 (CN-5 a): Records opens this screen with `mode=save` when no check is in view. */
export const QUICK_SAVE_MODE = 'save';

/** Quiet time before a screen reader reads the live line again, so typing is not read out digit by digit. */
const LIVE_SETTLE_MS = 700;

const valid = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n >= 0 && n <= MAX_INPUT_MINOR;

/** A saved figure in this currency, else null (a figure kept in another currency is never shown as this one). */
function savedFigure(stored: DecideSettingsRow | null, currency: string, figure: number | null | undefined): number | null {
  if (stored === null || figure === null || figure === undefined) return null;
  if (stored.currency !== null && stored.currency !== currency) return null;
  return valid(figure) ? figure : null;
}

/** The three starting figures from the saved rough figures. Only the spending sum is stored, so it starts in bills with everyday at 0. */
export function quickStart(stored: DecideSettingsRow | null, currency: string): { income: number | null; bills: number | null; everyday: number | null } {
  const income = savedFigure(stored, currency, stored?.rough_income);
  const spending = savedFigure(stored, currency, stored?.rough_spending);
  return { income, bills: spending, everyday: spending === null ? null : 0 };
}

type NeedKey = 'income' | 'bills' | 'everyday' | 'aboveZero';

/** The first figure still missing, for the line under the disabled button; null when ready. */
export function quickNeed(income: number | null, bills: number | null, everyday: number | null): NeedKey | null {
  if (!valid(income)) return 'income';
  if (!valid(bills)) return 'bills';
  if (!valid(everyday)) return 'everyday';
  const sum = bills + everyday;
  if (sum <= 0 || sum > MAX_INPUT_MINOR) return 'aboveZero';
  return null;
}

export interface QuickEstimatesScreenProps {
  currency: string;
  /** Today's local date (YYYY-MM-DD). */
  today: string;
  /** The stored settings, so a figure typed in another currency clears the rest in the same patch (CR-B01). */
  stored: DecideSettingsRow | null;
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
  const [start] = useState(() => quickStart(stored, currency));
  const [income, setIncome] = useState<number | null>(start.income);
  const [bills, setBills] = useState<number | null>(start.bills);
  const [everyday, setEveryday] = useState<number | null>(start.everyday);
  // The settings can arrive after the first render: while nothing has been typed, the saved figures fill in then.
  const [seen, setSeen] = useState(stored);
  const [typed, setTyped] = useState(false);
  if (seen !== stored) {
    setSeen(stored);
    if (!typed && seen === null) {
      const late = quickStart(stored, currency);
      setIncome(late.income);
      setBills(late.bills);
      setEveryday(late.everyday);
    }
  }
  const typing = (set: (n: number | null) => void) => (n: number | null) => {
    setTyped(true);
    set(n);
  };

  const spending = valid(bills) && valid(everyday) ? bills + everyday : null;
  // T-06.1-39-01: the sum must also be a positive figure within the input bound.
  const need = quickNeed(income, bills, everyday);
  const ready = need === null && valid(income) && spending !== null;
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

  const hint = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  return (
    <DetailScreen title={t('decide.screens.setup.quick.stepName')} keyboardShouldPersistTaps="handled">
      <View style={styles.block}>
        <Text accessibilityRole="header" testID="quick-headline" style={{ ...textRole(pairing, 'display'), color: colors.ink }}>
          {t('decide.screens.setup.quick.title')}
        </Text>
        {/* 06.1-60 (G-10): "Round numbers are fine." is the fields' hint; when the estimates count opens under Why?. */}
        <Text testID="quick-hint" style={hint}>{t('decide.screens.setup.quick.hint')}</Text>
        <WhyLine testID="quick-why">
          <Text style={hint}>{t('decide.screens.setup.quick.sub')}</Text>
          <Text style={hint}>{t('decide.screens.setup.quick.foot')}</Text>
        </WhyLine>
        <MoneyInput value={income} currency={currency} onChange={typing(setIncome)} prefix="symbol" label={t('decide.screens.setup.quick.income')} accessibilityLabel={t('decide.screens.setup.quick.income')} />
        <MoneyInput value={bills} currency={currency} onChange={typing(setBills)} prefix="symbol" label={t('decide.screens.setup.quick.bills')} accessibilityLabel={t('decide.screens.setup.quick.bills')} />
        <MoneyInput value={everyday} currency={currency} onChange={typing(setEveryday)} prefix="symbol" label={t('decide.screens.setup.quick.everyday')} accessibilityLabel={t('decide.screens.setup.quick.everyday')} />
        <View accessibilityLiveRegion="polite" testID="quick-live" style={styles.live}>
          {liveText !== '' ? (
            <Text accessibilityLabel={settled} style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
              {liveText}
            </Text>
          ) : null}
        </View>
        <Pill variant="primary" label={saveMode ? t('decide.screens.setupOthers.records.quickSave') : t('decide.screens.setup.quick.see')} disabled={!ready} onPress={see} />
        <NeedLine testID="quick-need" text={need === null ? null : t(`decide.screens.setup.quick.need.${need}`)} />
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
