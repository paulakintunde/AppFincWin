// 05.3 DSV-01/DSV-02 (D-04): every v3 route body is wrapped in this. While the profile loads, a skeleton; without the
// v3 switch, back to the Decide tab (which shows Coming soon). The layout's Stack.Protected block (05.3-43) is the second guard.
import React from 'react';
import { Redirect } from 'expo-router';
import { useDecideAccess } from '@/features/decide/useDecideAccess';
import { DECIDE_TAB_HREF } from '@/features/decide/v3/nav/hrefs';
import { V3Skeleton } from '@/features/decide/v3/nav/V3Skeleton';
import { useProfile } from '@/features/you/useProfile';

export function V3Gate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { loading } = useProfile();
  const { v3 } = useDecideAccess();
  if (loading) return <V3Skeleton />;
  if (!v3) return <Redirect href={DECIDE_TAB_HREF} />;
  return <>{children}</>;
}
