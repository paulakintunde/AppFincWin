// 06.1-18 (D-14, D-25, D-28): what the first answer still has to ask. The intro card is remembered on this phone by text version;
// the safety-net question is asked once -- never again after an amount made the flagged goal, or after "Not set yet" stamped
// answered_net_not_set_at. Reads only, plus the device flag write.
// 06.1-66 (FQ5, CN-11): a swipe or Back counts as seen. The intro is remembered as with Got it; the net question is remembered on
// this phone (netQuestionSeen) with nothing written to the account, and the answer then offers it as one line (useNetUnanswered).
import { useCallback, useEffect, useState } from 'react';
import { useDecideSettings } from '@/data/queries/decide';
import { DECIDE_READ_STALE_MS } from '@/data/queries/decideStale';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import { useIsOnline } from '@/data/sync/useIsOnline';
import { useT } from '@/i18n';
import { useRecordContext } from '@/features/record/useRecordContext';
import { loadIntroSeenVersion, loadNetQuestionSeen, markIntroSeen as storeIntroSeen, markNetQuestionSeen } from '../../hints/decideHints';
import { introVersion } from './introVersion';

export interface FirstAnswerGateState {
  loading: boolean;
  /** 06.1-52 (C-19): still loading because the device is offline and nothing is cached; the gate shows the offline card. */
  offline: boolean;
  /** Reads the settings and goals again (the offline card's Retry). */
  retry: () => void;
  needsIntro: boolean;
  needsNet: boolean;
  /** The version of the card now on screen (what Got it stores). */
  version: string;
  markIntroSeen: () => Promise<void>;
  /** 06.1-66 (FQ5): the net question was shown and put away; it is not asked again by the gate. */
  markNetSeen: () => Promise<void>;
}

/** 06.1-66 (FQ5): no safety net and no "Not set yet" on the account. False while loading or when a read failed. */
function netUnansweredOf(settings: ReturnType<typeof useDecideSettings>, goals: ReturnType<typeof useSavingsGoalRows>): boolean {
  if (settings.isError || goals.isError || settings.data === undefined || goals.data === undefined) return false;
  const hasNet = goals.data.some((g) => g.is_safety_net === true && g.deleted_at === null);
  return !hasNet && settings.data?.answered_net_not_set_at == null;
}

/** 06.1-66 (FQ5, CS-8): true while the safety-net question is still unanswered, so the answer can show its line. */
export function useNetUnanswered(): boolean {
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const settings = useDecideSettings(userId);
  const goals = useSavingsGoalRows(userId, rc.householdId ?? undefined, { staleTime: DECIDE_READ_STALE_MS });
  return netUnansweredOf(settings, goals);
}

export function useFirstAnswerGate(): FirstAnswerGateState {
  const t = useT() as unknown as (key: string) => string;
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const householdId = rc.householdId ?? undefined;
  const settings = useDecideSettings(userId);
  const goals = useSavingsGoalRows(userId, householdId, { staleTime: DECIDE_READ_STALE_MS }); // 06.1-78 (G-72-2)
  const isOnline = useIsOnline(); // 06.1-72: the online flag only
  const version = introVersion(t);
  // undefined = not read yet; null = never seen
  const [stored, setStored] = useState<string | null | undefined>(undefined);
  const [netSeen, setNetSeen] = useState(false);

  useEffect(() => {
    if (userId === undefined) return;
    let live = true;
    void Promise.all([loadIntroSeenVersion(userId), loadNetQuestionSeen(userId)]).then(([v, seen]) => {
      if (!live) return;
      setNetSeen(seen);
      setStored(v);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const markIntroSeen = useCallback(async (): Promise<void> => {
    if (userId !== undefined) await storeIntroSeen(userId, version);
    setStored(version);
  }, [userId, version]);

  const markNetSeen = useCallback(async (): Promise<void> => {
    setNetSeen(true);
    if (userId !== undefined) await markNetQuestionSeen(userId);
  }, [userId]);

  // A failed read must not hold the answer back: the question is then simply not asked this time.
  const readFailed = settings.isError || goals.isError;
  const loading = userId === undefined || stored === undefined || (!readFailed && (settings.data === undefined || goals.data === undefined));
  const nothingCached = !readFailed && (settings.data === undefined || goals.data === undefined);
  const offline = loading && !isOnline && nothingCached;
  const { refetch: refetchSettings } = settings;
  const { refetch: refetchGoals } = goals;
  const retry = useCallback((): void => {
    void refetchSettings?.();
    void refetchGoals?.();
  }, [refetchSettings, refetchGoals]);
  return {
    loading,
    offline,
    retry,
    needsIntro: !loading && stored !== version,
    needsNet: !loading && !netSeen && netUnansweredOf(settings, goals),
    version,
    markIntroSeen,
    markNetSeen,
  };
}
