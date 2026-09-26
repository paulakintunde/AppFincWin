import { useContext } from 'react';
import { Redirect, type Href } from 'expo-router';
import { RouteContext } from './_layout';

// 00-18 creates (app)/you.tsx — Expo Router's generated route types don't know about it yet,
// so this one target is force-cast rather than left as a plain string throughout.
const APP_HOME_HREF = '/you' as Href;

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
      return <Redirect href={APP_HOME_HREF} />;
    default:
      return null;
  }
}
