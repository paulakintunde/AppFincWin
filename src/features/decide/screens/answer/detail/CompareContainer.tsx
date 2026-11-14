// 06.1-20 (N16): reads the stored check by id and hands judgeBoth (through useCheckEngine) to the compare screen. Reading only: nothing
// is written here. The see-answer buttons open the answer route on the matching side (06.1-23); "What this can't see" opens the
// About sheet.
// 06.1-63 (CN-7 / CF-7, CN-13): while the checks load, the answer's loading line shows in the Compare frame ("This check isn't here"
// only once the checks loaded without this id). "See …" goes back to the answer already in the stack with `side` set (dismissTo),
// so no second answer is stacked.
import React, { useMemo, useState } from 'react';
import { router, type Href } from 'expo-router';
import { useT } from '@/i18n';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { AnswerLoadingBody } from '../AnswerLoading';
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
  const t = useT();
  if (checks.isLoading || (checks.data === undefined && !checks.isError)) {
    return (
      <DetailScreen title={t('decide.screens.answerDetail.sideBySide.title')}>
        <AnswerLoadingBody />
      </DetailScreen>
    );
  }
  if (row === null || check === null) return <CheckNotFound />;
  const seeAnswer = (side: 'cash' | 'installments'): void => {
    router.dismissTo({ pathname: '/decide/answer/[id]', params: { id, side } } as unknown as Href);
  };
  return (
    <>
      <CompareScreen check={check} currency={rc.homeCurrency} engine={engine} onSeeAnswer={seeAnswer} onCantSee={() => setAbout(true)} />
      {about ? <AboutSheet result={engine.evaluation?.result ?? null} country={rc.region} said={{ currency: rc.homeCurrency, today: rc.today }} onClose={() => setAbout(false)} /> : null}
    </>
  );
}
