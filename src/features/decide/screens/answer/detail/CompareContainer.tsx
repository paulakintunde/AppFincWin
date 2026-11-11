// 06.1-20 (N16): reads the stored check by id and hands judgeBoth (through useCheckEngine) to the compare screen. Reading only: nothing
// is written here. The see-answer buttons return to the check; the answer route (plan 23) picks the paid-once or installments side.
import React, { useMemo } from 'react';
import { router } from 'expo-router';
import { readStoredCheck } from '@/engine/decide/v3';
import { useDecideChecks } from '@/data/queries/decide';
import { useRecordContext } from '@/features/record/useRecordContext';
import { CompareScreen } from './CompareScreen';
import { useCheckEngine } from '../../engine/useCheckEngine';
import { CheckNotFound } from '@/features/decide/check/CheckFlowScreen';
import { checkHref } from '@/features/decide/home/checkHref';

export function CompareContainer({ id }: { id: string }): React.JSX.Element {
  const rc = useRecordContext();
  const checks = useDecideChecks(rc.userId ?? undefined, rc.householdId ?? undefined);
  const row = useMemo(() => checks.data?.find((r) => r.id === id) ?? null, [checks.data, id]);
  const check = useMemo(() => (row === null ? null : readStoredCheck(row.inputs).check), [row]);
  const engine = useCheckEngine(check, { checkId: id });
  if (row === null || check === null) return <CheckNotFound />;
  const back = (): void => {
    router.replace(checkHref(id));
  };
  return <CompareScreen check={check} currency={rc.homeCurrency} engine={engine} onSeeAnswer={back} onCantSee={() => router.back()} />;
}
