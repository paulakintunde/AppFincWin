import React from 'react';
import { StatusBar } from 'expo-status-bar';

/**
 * DSG-03: the app draws edge-to-edge (mandatory on Android 15+ / SDK 57), so the status bar is
 * transparent over the canvas. Every screen sits on the light §2 canvas, so status-bar content
 * must be dark to stay legible — the native Android theme otherwise defaults to light icons.
 * Mounted once at the root so every route inherits it.
 */
export function AppStatusBar() {
  return <StatusBar style="dark" />;
}
