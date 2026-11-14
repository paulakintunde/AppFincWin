// 06.1-39 (D39): mounts the quick-estimates first answer with the stored settings and the record context. The screen may not import the
// write path, so it comes from here. `returnTo` is only followed when it is a path inside /decide; anything else goes to Decide home.
// 06.1-64 (CN-5 b): from an answer, Done goes back to that answer instead of replacing with a second copy.
// 06.1-61: the screen saves through the undoable setup save itself (06.1-65 CC-7), so no settings write is passed in.
import React from 'react';
import { router } from 'expo-router';
import { useDecideSettings } from '@/data/queries/decide';
import { QuickEstimatesScreen } from '@/features/decide/screens/setup/QuickEstimatesScreen';
import { returnFromQuickEstimates } from '@/features/decide/screens/logic/decideNav';
import { useRecordContext } from '@/features/record/useRecordContext';

export function QuickEstimatesRoute({ returnTo }: { returnTo?: string | string[] }): React.JSX.Element {
  const rc = useRecordContext();
  const stored = useDecideSettings(rc.userId ?? undefined).data ?? null;
  return (
    <QuickEstimatesScreen
      currency={rc.homeCurrency}
      today={rc.today}
      stored={stored}
      onDone={() => returnFromQuickEstimates(router, returnTo)}
    />
  );
}
