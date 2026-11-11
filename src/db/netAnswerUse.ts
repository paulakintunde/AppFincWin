// 06.1-12 (D-20): client side of set_net_answer_use (migration 20261111000100).
// set_net_answer_use(p_goal_id, p_on, p_expected_version, p_undo_step)
//   -> { status: 'applied' | 'already-applied' | 'unchanged' | 'conflict', goal_id, goal_version, undo_step_id }
// The server builds the one undo step; label_key is 'safetyNetUnlocked' (on) or 'safetyNetLocked' (off).
import { DbError, VersionConflictError, toDbError } from './errors';
import { BAD_RESPONSE } from './recurringSeries';
import type { DbClient } from './rows';

export interface SetNetAnswerUseInput {
  goalId: string;
  on: boolean;
  expectedVersion: number;
  undoStep: { id: string; name: string };
}

export interface SetNetAnswerUseResult {
  status: 'applied' | 'already-applied' | 'unchanged';
  goalVersion: number | null;
}

export async function setNetAnswerUse(client: DbClient, input: SetNetAnswerUseInput): Promise<SetNetAnswerUseResult> {
  const { data, error, status } = await client.rpc('set_net_answer_use', {
    p_goal_id: input.goalId,
    p_on: input.on,
    p_expected_version: input.expectedVersion,
    p_undo_step: {
      id: input.undoStep.id,
      label_key: input.on ? 'safetyNetUnlocked' : 'safetyNetLocked',
      label_params: { name: input.undoStep.name },
    },
  });
  if (error) throw toDbError(error, status);
  if (typeof data !== 'object' || data === null) throw new DbError('set_net_answer_use response: not an object', BAD_RESPONSE, null);
  const r = data as Record<string, unknown>;
  if (r.status === 'conflict') throw new VersionConflictError('savings_goals', input.goalId, null);
  if (r.status !== 'applied' && r.status !== 'already-applied' && r.status !== 'unchanged') {
    throw new DbError(`set_net_answer_use response: unrecognised ${JSON.stringify(r.status)}`, BAD_RESPONSE, null);
  }
  return { status: r.status, goalVersion: typeof r.goal_version === 'number' && Number.isInteger(r.goal_version) ? r.goal_version : null };
}
