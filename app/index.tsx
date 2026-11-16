import { useContext, useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { APP_HOME_HREF } from '@/features/auth/appHome';
import { peekPendingInvite } from '@/features/household/join/pendingInvite';
import { RouteContext } from './_layout';

/**
 * The root layout only renders its <Stack> once resolveRoute() is no longer 'splash'
 * (app/_layout.tsx's Gate component), so by the time this screen mounts, RouteContext is
 * always already 'update-required' | 'welcome' | 'app' — the `default` branch below only
 * exists to satisfy the type checker, not because it is expected to run.
 */
export default function IndexRoute() {
  const route = useContext(RouteContext);

  switch (route) {
    case 'update-required':
      return <Redirect href="/update-required" />;
    case 'welcome':
      return <Redirect href="/welcome" />;
    case 'app':
      return <AppEntry />;
    default:
      return null;
  }
}

/** 08-18: a signed-in person with an invite code waiting (it arrived before sign-in) lands on the join screen, not home. */
function AppEntry() {
  const [target, setTarget] = useState<'checking' | 'join' | 'home'>('checking');

  useEffect(() => {
    let cancelled = false;
    void peekPendingInvite()
      .then((code) => {
        if (!cancelled) setTarget(code === null ? 'home' : 'join');
      })
      .catch(() => {
        if (!cancelled) setTarget('home');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (target === 'checking') return null;
  return <Redirect href={target === 'join' ? '/household/join' : APP_HOME_HREF} />;
}
