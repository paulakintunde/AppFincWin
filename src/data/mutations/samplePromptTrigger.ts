// CONTEXT D-11: "the first non-sample line saved" prompts once, whichever path saved it (single
// add, clone month, paste, statement import) and D-10: editing a sample line makes it real.
// Reads the query cache only: no network call, so it never blocks or fails a save. Unknown cache
// entries mean no prompt.
import type { QueryClient } from '@tanstack/react-query';
import type { RecordPrefsRow } from '@/db/recordPrefs';
import { queryKeys } from '@/data/keys';
import { requestSampleClearPrompt } from '@/state/samplePrompt';

export function maybeRequestSampleClearPrompt(qc: QueryClient, ids: { householdId: string; userId: string }): void {
  const sampleExists = qc.getQueryData<boolean>(queryKeys.sampleExists(ids.householdId));
  if (sampleExists !== true) return;
  const prefs = qc.getQueryData<RecordPrefsRow>(queryKeys.recordPrefs(ids.userId));
  if (!prefs || prefs.sample_prompt_answered_at !== null) return;
  requestSampleClearPrompt();
}
