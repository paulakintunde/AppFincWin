// 06.1-18 (D-14, D-25, D-28): what the first answer still has to ask. The intro card is remembered on this phone by text version;
// the safety-net question is asked once -- never again after an amount made the flagged goal, or after "Not set yet" stamped
// answered_net_not_set_at. Reads only, plus the device flag write.
import { useCallback, useEffect, useState } from 'react';
import { useDecideSettings } from '@/data/queries/decide';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import { useT } from '@/i18n';
import { useRecordContext } from '@/features/record/useRecordContext';
import { loadIntroSeenVersion, markIntroSeen as storeIntroSeen } from '../../hints/decideHints';
import { introVersion } from './introVersion';

export interface FirstAnswerGateState {
  loading: boolean;
  needsIntro: boolean;
  needsNet: boolean;
  /** The version of the card now on screen (what Got it stores). */
  version: string;
  markIntroSeen: () => Promise<void>;
}

export function useFirstAnswerGate(): FirstAnswerGateState {
  const t = useT() as unknown as (key: string) => string;
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const householdId = rc.householdId ?? undefined;
  const settings = useDecideSettings(userId);
  const goals = useSavingsGoalRows(userId, householdId);
  const version = introVersion(t);
  // undefined = not read yet; null = never seen
  const [stored, setStored] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (userId === undefined) return;
    let live = true;
    void loadIntroSeenVersion(userId).then((v) => {
      if (live) setStored(v);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const markIntroSeen = useCallback(async (): Promise<void> => {
    if (userId !== undefined) await storeIntroSeen(userId, version);
    setStored(version);
  }, [userId, version]);

  // A failed read must not hold the answer back: the question is then simply not asked this time.
  const readFailed = settings.isError || goals.isError;
  const loading = userId === undefined || stored === undefined || (!readFailed && (settings.data === undefined || goals.data === undefined));
  const hasNet = (goals.data ?? []).some((g) => g.is_safety_net === true && g.deleted_at === null);
  const notSetAnswered = settings.data?.answered_net_not_set_at != null;
  return {
    loading,
    needsIntro: !loading && stored !== version,
    needsNet: !loading && !readFailed && !hasNet && !notSetAnswered,
    version,
    markIntroSeen,
  };
}
