import { router, useLocalSearchParams } from 'expo-router';
import { ImportScreen } from '@/features/record/import/ImportScreen';
import type { ImportEntry } from '@/features/record/import/useStatementImport';

// T-02-29-01: route params are untrusted strings, so anything but the three known entries
// becomes 'you'. accountId only pre-selects an account; the screen's own account list (RLS)
// decides whether it is one the user can see.
function parseEntry(raw: string | undefined): ImportEntry {
  return raw === 'onboarding' || raw === 'account' ? raw : 'you';
}

export default function ImportRoute() {
  const params = useLocalSearchParams<{ entry?: string; accountId?: string }>();
  return (
    <ImportScreen
      entry={parseEntry(params.entry)}
      accountId={params.accountId ?? null}
      onDone={() => router.replace('/activity')}
    />
  );
}
