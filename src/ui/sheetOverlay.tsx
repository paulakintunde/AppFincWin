// D-16: lets the app inject what renders in the TOP sheet's native window (the toast host) without
// src/ui importing feature code. Modal children stay in the React tree, so this context reaches every sheet.
import React, { createContext, useContext } from 'react';

const SheetOverlayContext = createContext<React.ComponentType | null>(null);

export function SheetOverlayProvider({
  overlay,
  children,
}: {
  overlay: React.ComponentType;
  children: React.ReactNode;
}): React.JSX.Element {
  return <SheetOverlayContext.Provider value={overlay}>{children}</SheetOverlayContext.Provider>;
}

export function useSheetOverlay(): React.ComponentType | null {
  return useContext(SheetOverlayContext);
}

/** Renders the injected overlay, if any. Kept here so Sheet need not create a component during render. */
export function SheetOverlaySlot(): React.JSX.Element | null {
  const overlay = useSheetOverlay();
  return overlay === null ? null : React.createElement(overlay);
}
