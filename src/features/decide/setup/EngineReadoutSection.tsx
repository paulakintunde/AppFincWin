/**
 * Plan 05.3-37: the engine readout for test accounts, moved from the old setup page to the bottom of Decide settings.
 * Builds the rows the same way DecideSetupPage does (readoutRows over the v3 inputs and evaluation). Reads only.
 */
import React, { useMemo } from 'react';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useNoWrapMoney } from '@/features/income/steps/shared';
import { useT } from '@/i18n';
import { EngineReadoutCard } from './EngineReadoutCard';
import { readoutRows, type ReadoutFormat } from './readoutModel';

export function EngineReadoutSection(): React.JSX.Element | null {
  const t = useT() as unknown as (key: string, options?: Record<string, unknown>) => string;
  const rc = useRecordContext();
  const { inputs, evaluation } = useDecideV3();
  const accounts = useAccounts(rc.householdId ?? undefined).data;
  const currency = inputs?.currency ?? rc.homeCurrency;
  const formatter = useMoneyFormatter(false, currency);
  const noWrap = useNoWrapMoney(currency);

  const rows = useMemo(() => {
    if (inputs === null || evaluation === null) return [];
    const accountNames = Object.fromEntries((accounts ?? []).map((a) => [a.id, a.name]));
    const fmt: ReadoutFormat = {
      money: (minor) => noWrap(minor),
      date: (iso) => formatter.formatDate(iso),
      word: (key, params) => t(key, params),
    };
    return readoutRows(inputs, evaluation, { accountNames }, fmt).map((r) => ({ id: r.id, label: t(r.labelKey), value: r.value }));
    // the formatters are stable per currency and locale; t per language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, evaluation, accounts, currency, t]);

  return rows.length === 0 ? null : <EngineReadoutCard rows={rows} />;
}
