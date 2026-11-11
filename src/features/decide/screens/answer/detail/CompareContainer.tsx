// 06.1-20 (N16): reads the stored check by id and hands judgeBoth (through useCheckEngine) to the compare screen. Reading only: nothing
// is written here. The see-answer buttons open the answer route on the matching side (06.1-23); "What this can't see" opens the
// About sheet.
import React, { useMemo, useState } from 'react';
import { router, type Href } from 'expo-router';
import { readStoredCheck } from '@/engine/decide/v3';
import { useDecideChecks } from '@/data/queries/decide';
import { useRecordContext } from '@/features/record/useRecordContext';
import { CompareScreen } from './CompareScreen';
import { useCheckEngine } from '../../engine/useCheckEngine';
import { CheckNotFound } from '@/features/decide/screens/ui/CheckNotFound';
import { AboutSheet } from '../info/AboutSheet';

export function CompareContainer({ id }: { id: string }): React.JSX.Element {
  const rc = useRecordContext();
  const checks = useDecideChecks(rc.userId ?? undefined, rc.householdId ?? undefined);
  const row = useMemo(() => checks.data?.find((r) => r.id === id) ?? null, [checks.data, id]);
  const check = useMemo(() => (row === null ? null : readStoredCheck(row.inputs).check), [row]);
  const engine = useCheckEngine(check, { checkId: id });
  const [about, setAbout] = useState(false);
  if (row === null || check === null) return <CheckNotFound />;
  const seeAnswer = (side: 'cash' | 'installments'): void => {
    router.replace({ pathname: '/decide/answer/[id]', params: { id, side } } as unknown as Href);
  };
  return (
    <>
      <CompareScreen check={check} currency={rc.homeCurrency} engine={engine} onSeeAnswer={seeAnswer} onCantSee={() => setAbout(true)} />
      {about ? <AboutSheet result={engine.evaluation?.result ?? null} country={rc.region} said={{ currency: rc.homeCurrency, today: rc.today }} onClose={() => setAbout(false)} /> : null}
    </>
  );
}
