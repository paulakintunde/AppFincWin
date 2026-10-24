/** D-75: every fold tap and every Show/Hide details tap reports here, so the first-run hint can be dismissed by either. */
import { createContext, useContext } from 'react';

export const RevealTapContext = createContext<() => void>(() => undefined);

export function useRevealTap(): () => void {
  return useContext(RevealTapContext);
}
