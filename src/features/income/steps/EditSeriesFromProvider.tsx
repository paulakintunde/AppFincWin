import React, { type ReactNode } from 'react';
import { useEditSeriesFrom } from '@/data/mutations/recurringSeries';
import { EditSeriesFromContext, type EditSeriesFromFn } from './editSeriesFromContext';

/** Mount from a host outside features/decide; wires the real series-edit write. */
export function EditSeriesFromProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const { editFrom } = useEditSeriesFrom();
  return <EditSeriesFromContext.Provider value={editFrom as EditSeriesFromFn}>{children}</EditSeriesFromContext.Provider>;
}
