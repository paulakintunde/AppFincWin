// 06.1-39 (D39): mounts the quick-estimates first answer with the settings write and the record context. The screen may not import the
// write path, so it comes from here. `returnTo` is only followed when it is a path inside /decide; anything else goes to Decide home.
import React from 'react';
import { router, type Href } from 'expo-router';
import { useUpdateDecideSettings } from '@/data/mutations/decideSettings';
import { useDecideSettings } from '@/data/queries/decide';
import { QuickEstimatesScreen } from '@/features/decide/screens/setup/QuickEstimatesScreen';
import { safeReturnTo } from '@/features/decide/screens/setup/safeReturnTo';
import { useRecordContext } from '@/features/record/useRecordContext';

export function QuickEstimatesRoute({ returnTo }: { returnTo?: string | string[] }): React.JSX.Element {
  const rc = useRecordContext();
  const { update } = useUpdateDecideSettings(rc.userId ?? '');
  const stored = useDecideSettings(rc.userId ?? undefined).data ?? null;
  return (
    <QuickEstimatesScreen
      currency={rc.homeCurrency}
      today={rc.today}
      stored={stored}
      onSave={(patch) => {
        if (rc.userId !== null) update(patch);
      }}
      onDone={() => router.replace(safeReturnTo(returnTo) as Href)}
    />
  );
}
