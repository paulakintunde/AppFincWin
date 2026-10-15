import { useLocalSearchParams, useRootNavigationState } from 'expo-router';
import type { NavStateLike } from '@/shell/backHistory/navLocation';
import { finishImport, parseImportReturn } from '@/features/record/import/importReturn';
import { ImportScreen } from '@/features/record/import/ImportScreen';
import type { ImportEntry } from '@/features/record/import/useStatementImport';

// T-02-29-01: route params are untrusted strings, so anything but the three known entries
// becomes 'you'. accountId only pre-selects an account; the screen's own account list (RLS)
// decides whether it is one the user can see.
function parseEntry(raw: string | undefined): ImportEntry {
  return raw === 'onboarding' || raw === 'account' ? raw : 'you';
}

export default function ImportRoute() {
  const params = useLocalSearchParams<{ entry?: string; accountId?: string; from?: string }>();
  const navState = useRootNavigationState() as unknown as NavStateLike | undefined;
  return (
    <ImportScreen
      entry={parseEntry(params.entry)}
      accountId={params.accountId ?? null}
      onDone={() => finishImport(parseImportReturn(params.from), navState)}
    />
  );
}
