// 08.1-05 (ROADMAP SC8): fills the tester build text for accounts on the reviewed tester list (profiles.decide_v3, set only for
// docs/ops/decide-testers.json). Everyone else gets null, so the build line never shows.
import React, { type ReactNode } from 'react';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { useProfile } from '@/features/you/useProfile';
import { TesterBuildContext } from './TesterBuildLine';

/** App version, plus the first 8 characters of the OTA update id when an update is running. */
export function buildLabel(): string {
  const version = Application.nativeApplicationVersion ?? '0.0.0';
  const id = Updates.updateId;
  return id ? `${version} (${id.slice(0, 8)})` : version;
}

export function TesterBuildProvider({ children }: { children: ReactNode }) {
  const { profile } = useProfile();
  const build = profile?.decide_v3 === true ? buildLabel() : null;
  return <TesterBuildContext.Provider value={build}>{children}</TesterBuildContext.Provider>;
}
