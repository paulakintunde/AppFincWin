// 08-18 (D-38): the deep-link entry for fincwin://invite?code=XXXX-XXXX-XXXX. It lives outside the (app) group so it
// resolves while signed out. It only stores a valid code and moves on: a signed-in person goes to the join screen (which shows
// the preview and waits for a tap), anyone else goes to the start, and the code waits until they have signed in. No web link
// exists and nothing is redeemed from here.
import { useContext, useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { savePendingInvite } from '@/features/household/join/pendingInvite';
import { RouteContext } from './_layout';

export default function InviteRoute() {
  const route = useContext(RouteContext);
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const raw = Array.isArray(params.code) ? params.code[0] : params.code;
  const [stored, setStored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (raw) await savePendingInvite(raw);
      } catch {
        // A storage failure only means the code is not remembered across sign-in; the person can still type it.
      }
      if (!cancelled) setStored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [raw]);

  if (!stored) return null;
  return <Redirect href={route === 'app' ? '/household/join' : '/'} />;
}
