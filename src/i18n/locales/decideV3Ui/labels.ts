// 05.3: decide.v3.ui keys whose text may open with an imperative verb because they label a button (ACTION) or a
// field / control (CONTROL). decideCopy.test.ts merges these into its allow-sets. Each entry carries a reason comment.
import { UI_ACTION_KEYS_A, UI_CONTROL_KEYS_A } from './labelsA';
import { UI_ACTION_KEYS_B, UI_CONTROL_KEYS_B } from './labelsB';
export const UI_ACTION_KEYS: readonly string[] = [...UI_ACTION_KEYS_A, ...UI_ACTION_KEYS_B];
export const UI_CONTROL_KEYS: readonly string[] = [...UI_CONTROL_KEYS_A, ...UI_CONTROL_KEYS_B];
