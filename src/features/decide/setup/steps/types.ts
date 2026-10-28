/**
 * The contract every setup step body implements (plan 05.2-21).
 *
 * The setup shell, settings edit mode and the Activity standalone host all
 * mount the same step components through this one interface:
 * `forwardRef<SetupStepHandle, SetupStepBodyProps>`.
 */
export type { SetupFacts } from '../setupFlow';

export interface SetupStepReady {
  readonly canContinue: boolean;
  /** Copy key explaining why Continue is off, or null when it is on. */
  readonly reasonKey: string | null;
  /** True when the step holds answers that differ from what is stored. */
  readonly dirty: boolean;
}

export interface SetupStepBodyProps {
  readonly mode: 'stepper' | 'edit' | 'standalone';
  readonly onReadyChange: (ready: SetupStepReady) => void;
}

export interface SetupStepHandle {
  /**
   * Writes the step's answers through its mutations. Returns the undo step
   * id, or null when nothing changed (no write, no toast).
   */
  save(): { stepId: string | null };
}
