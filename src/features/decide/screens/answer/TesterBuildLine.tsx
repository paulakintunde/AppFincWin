// 08.1-05 (ROADMAP SC8): "Build {build}" under the legal footer, for accounts on the reviewed tester list only. Plain text, not a
// button. The build text arrives through a context that TesterBuildProvider (mounted once in the app layout) fills for tester
// accounts; with no provider or a non-tester it is null and nothing renders. Keeping the profile read out of this file keeps the
// legal block free of the auth and Supabase imports.
import React, { createContext, useContext } from 'react';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';

export const TesterBuildContext = createContext<string | null>(null);

export function TesterBuildLine() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const build = useContext(TesterBuildContext);
  if (build === null) return null;
  return (
    <Text testID="answer-build" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
      {t('decide.screens.answer.testerBuild', { build })}
    </Text>
  );
}
