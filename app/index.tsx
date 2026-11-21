import { useContext, useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useHousehold } from '@/data/queries/household';
import { useUserSetupQuery } from '@/data/queries/userSetup';
import { useAuth } from '@/features/auth/AuthProvider';
import { APP_HOME_HREF } from '@/features/auth/appHome';
import { peekPendingInvite } from '@/features/household/join/pendingInvite';
import { firstRunTarget, setupDone } from '@/features/onboarding/firstRun';
import { onboardingHref } from '@/features/plans/routes';
import { usePlanState } from '@/features/plans/usePlanState';
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

const ENTRY_WAIT_MS = 4000;

/**
 * 08-18: a signed-in person with an invite code waiting (it arrived before sign-in) lands on the join screen, not home.
 * 09-23 (D-28, D-30, UI-SPEC 3): then a person with no setup on the server goes to the questions (the partner version when
 * they joined someone else's home); a person whose setup exists on any device, or was backfilled, goes Home.
 */
function AppEntry() {
  const { user } = useAuth();
  const userId = user?.id;
  const [invite, setInvite] = useState<{ checked: boolean; code: string | null }>({ checked: false, code: null });
  const setupQ = useUserSetupQuery(userId);
  const plan = usePlanState();
  const household = useHousehold(plan.householdId);
  // Offline with nothing cached, a read can wait for ever without an error. Never trap a person (T-09-78): after a short
  // wait an unread setup row counts as an error (Home), and an unread plan or household counts as a home of one.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), ENTRY_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void peekPendingInvite()
      .then((code) => {
        if (!cancelled) setInvite({ checked: true, code });
      })
      .catch(() => {
        if (!cancelled) setInvite({ checked: true, code: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setup = setupQ.data ?? null;
  const setupUnread = Boolean(userId) && setupQ.data === undefined && !setupQ.isError;
  const setupLoading = setupUnread && !timedOut;
  // Who is in the home matters only for a person with no finished setup in a home of two or more.
  const needsHousehold = !setupLoading && !setupDone(setup) && plan.members >= 2;
  const householdLoading = !timedOut && needsHousehold && household.data === undefined && !household.isError;
  const planLoading = !timedOut && !setupLoading && !setupDone(setup) && plan.loading && !plan.isError;

  if (!invite.checked) return null;
  const target = firstRunTarget({
    pendingInvite: invite.code,
    setup,
    setupLoading: setupLoading || planLoading || householdLoading,
    setupError: (setupQ.isError || setupUnread) && setupQ.data === undefined,
    members: plan.members,
    isOwner: household.data == null || household.data.owner_id === userId,
  });

  if (target === 'checking') return null;
  if (target === 'join') return <Redirect href="/household/join" />;
  if (target === 'home') return <Redirect href={APP_HOME_HREF} />;
  return <Redirect href={onboardingHref(target.onboarding)} />;
}
