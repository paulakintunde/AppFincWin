// 09-24 (D-17b, D-28, owner Q4, UI-SPEC 4): the sample-data look-around's host. Renders nothing; mounted once in the tabs layout.
// - Plan status 'sample' (pre-trial, no plan) and no sample data yet: seeds the 02.2 sample data once, for today's local date,
//   through seed_sample_data (the one write the 09-03 lock lets through; it writes is_sample rows only, T-09-80).
// - The first time in sample mode on this phone (flag `fincwin:sample-opened:<userId>`), opens the seeded demo check's Decide
//   answer, so the sample answer counts for the 60-second / 8-tap target (D-28). Later launches stay on Home.
// - Any other status (trial, active, tester, grace, locked) never seeds and never navigates. While the plan is still loading
//   usePlanState reports 'sample' with loading true, so loading is checked first: a paying user is never seeded by mistake.
// The answer's numbers come from the engine run on the sample records (the answer route judges the stored check).
import { useEffect, useRef, useState } from 'react';
import { router, type Href } from 'expo-router';
import { useSampleData } from '@/data/mutations/sampleData';
import { useDecideChecks } from '@/data/queries/decide';
import { useSampleExists } from '@/data/queries/recordPrefs';
import type { DecideCheckRow } from '@/db/decideChecks';
import { DECIDE_OPEN } from '@/features/decide/availability';
import { usePlanState } from '@/features/plans/usePlanState';
import { useRecordContext } from '@/features/record/useRecordContext';
import { loadSampleOpened, markSampleOpened } from './sampleFlags';

/** The seeded demo check the look-around opens on: the oldest live sample check. Null when none is seeded. */
export function sampleAnswerCheckId(rows: readonly DecideCheckRow[] | undefined): string | null {
  const live = (rows ?? []).filter((c) => c.is_sample && c.deleted_at == null);
  if (live.length === 0) return null;
  const sorted = [...live].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1));
  return sorted[0]?.id ?? null;
}

export function sampleAnswerHref(id: string): Href {
  return { pathname: '/decide/answer/[id]', params: { id } } as unknown as Href;
}

export function SampleHost(): null {
  const plan = usePlanState();
  const rc = useRecordContext();
  const inSample = !plan.loading && plan.status === 'sample' && rc.ready && rc.userId !== null && rc.householdId !== null;
  const samples = useSampleExists(inSample ? (rc.householdId ?? undefined) : undefined);
  const checks = useDecideChecks(inSample && DECIDE_OPEN ? (rc.userId ?? undefined) : undefined, rc.householdId ?? undefined);
  const { seed } = useSampleData({ userId: rc.userId ?? '', householdId: rc.householdId ?? '', today: rc.today });

  const seeded = useRef(false);
  const opened = useRef(false);
  // null: not read yet; true: opened before on this phone.
  const [openedBefore, setOpenedBefore] = useState<boolean | null>(null);

  const userId = rc.userId;
  useEffect(() => {
    if (!inSample || userId === null) return;
    let live = true;
    void loadSampleOpened(userId).then((v) => {
      if (live) setOpenedBefore(v);
    });
    return () => {
      live = false;
    };
  }, [inSample, userId]);

  // Seed once per mount, only when the server said there is no sample data (a failed read never seeds).
  useEffect(() => {
    if (!inSample || seeded.current) return;
    if (!samples.isSuccess || samples.hasSamples) return;
    seeded.current = true;
    void seed();
  }, [inSample, samples.isSuccess, samples.hasSamples, seed]);

  const checkId = DECIDE_OPEN ? sampleAnswerCheckId(checks.data) : null;
  useEffect(() => {
    if (!inSample || userId === null || opened.current) return;
    if (openedBefore !== false || checkId === null) return;
    opened.current = true;
    void markSampleOpened(userId);
    router.push(sampleAnswerHref(checkId));
  }, [inSample, userId, openedBefore, checkId]);

  return null;
}
