// 05.4 BO-08 (D-11, D-13, D-145): the quiet shadow-run host. Mounted in the tabs layout for every signed-in user, also while
// Decide is off (DecideShellHost mounts only when DECIDE_OPEN). Renders nothing. Only a tester (profiles.decide_shadow) mounts the
// runner, so nobody else loads the Decide reads. The runner waits for the Decide inputs and an idle moment, runs once per mount,
// and tries again when the phone comes back online.
import { onlineManager } from '@tanstack/react-query';
import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { insertShadowRuns } from '@/db/decideShadowRuns';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useProfile } from '@/features/you/useProfile';
import { captureError, captureFailedWrite } from '@/services/errors/errorReporter';
import { supabase } from '@/services/supabase';
import { scheduleIdle } from '../check/scheduleIdle';
import { runShadow, type ShadowReporter } from './runShadow';

const subscribeOnline = onlineManager.subscribe.bind(onlineManager);
const isOnline = (): boolean => onlineManager.isOnline();

const reporter: ShadowReporter = {
  failedWrite: (code) => captureFailedWrite({ entity: 'decide_shadow_runs', kind: 'insert', code }),
  failed: () => captureError(new Error('decide shadow run failed'), { area: 'sync' }),
};

function ShadowRunner({ userId }: { readonly userId: string }): null {
  const { status, inputs } = useDecideV3();
  const online = useSyncExternalStore(subscribeOnline, isOnline);
  const busy = useRef(false);
  const done = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || inputs === null || !online || busy.current || done.current) return undefined;
    return scheduleIdle(() => {
      busy.current = true;
      void runShadow({
        enabled: true,
        userId,
        inputs,
        online: isOnline,
        storage: AsyncStorage,
        insert: (rows) => insertShadowRuns(supabase, rows),
        report: reporter,
      }).then((outcome) => {
        busy.current = false;
        // offline: the next online change runs it again. Anything else is settled for this app open.
        if (outcome !== 'offline') done.current = true;
      });
    });
  }, [status, inputs, online, userId]);

  return null;
}

export function DecideShadowHost(): React.JSX.Element | null {
  const { profile } = useProfile();
  return profile?.decide_shadow === true ? <ShadowRunner userId={profile.id} /> : null;
}
