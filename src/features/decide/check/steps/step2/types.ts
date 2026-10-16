import type { StepProps } from '../../stepTypes';

export interface Step2Props extends StepProps {
  /** Wired by the flow screen (05-30) to the saveCardRate mutation (05-19). */
  onSaveCardRate: (accountId: string, aprText: string) => void;
}
