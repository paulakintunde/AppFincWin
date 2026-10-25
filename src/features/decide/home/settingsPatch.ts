/**
 * CR-B01: decide_settings has one `currency` column for every money column (reserve, the two floors and the rough
 * figures). A patch stamps the currency only when it writes a money figure, so editing the debt line, the unsecured
 * multiple, the housing line (housing_line, D-103: a percentage, never a money column) or "Use the default" never relabels figures typed in another currency. When a money figure is written in
 * a currency other than the stored one, every other money column is cleared in the same patch: a figure is never
 * left carrying a currency it was not typed in.
 */
import type { DecideSettingsPatch, DecideSettingsRow } from '@/db/decideSettings';

export const SETTINGS_MONEY_COLUMNS = ['reserve', 'investing_floor', 'saving_floor', 'rough_income', 'rough_spending'] as const;

export function stampSettingsPatch(
  patch: DecideSettingsPatch,
  settings: DecideSettingsRow | null,
  currency: string,
): DecideSettingsPatch {
  const writesMoney = SETTINGS_MONEY_COLUMNS.some((c) => patch[c] !== undefined && patch[c] !== null);
  if (!writesMoney) return patch;
  const switching = settings !== null && settings.currency !== null && settings.currency !== currency;
  if (!switching) return { ...patch, currency };
  const reset: DecideSettingsPatch = {};
  for (const c of SETTINGS_MONEY_COLUMNS) reset[c] = null;
  return { ...reset, ...patch, currency };
}
