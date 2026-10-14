import React, { createContext, useContext, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

// Default 1 so the hook never throws outside a provider (tests, isolated renders).
const FontScaleContext = createContext<number>(1);

export function FontScaleProvider({ children, value }: { children: ReactNode; value?: number }) {
  const { fontScale } = useWindowDimensions();
  return (
    <FontScaleContext.Provider value={value ?? fontScale}>{children}</FontScaleContext.Provider>
  );
}

export function useFontScale(): number {
  return useContext(FontScaleContext);
}
