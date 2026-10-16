import type { StepProps } from '../../stepTypes';

export interface Step2Props extends StepProps {
  /** Wired by the flow screen (05-30) to the saveCardRate mutation (05-19). */
  onSaveCardRate: (accountId: string, aprText: string) => void;
  /** 05-53 (D-40): wired by the flow screen (05-30) to useSaveCardTerms (05-19). */
  onSaveCardTerms: (accountId: string, terms: { percentText: string | null; interestAdded: boolean | null; floor: number | null; paidInFull: boolean }) => void;
}
