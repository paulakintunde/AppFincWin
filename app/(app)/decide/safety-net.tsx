import React from 'react';
import { Redirect, type Href } from 'expo-router';
import { DECIDE_SETUP_VISIBLE } from '@/features/decide/availability';
import { SafetyNetSettings } from '@/features/decide/screens/safetyNet/SafetyNetSettings';
import { useDecideAccess } from '@/features/decide/useDecideAccess';

// 06.1-18 (D51): Decide's safety-net settings. Same per-account gate as /decide/settings (decide_v3), so an account without the
// switch is sent to the Decide tab. Thin: the screen owns everything.
export default function SafetyNetRoute(): React.JSX.Element {
  const { v3 } = useDecideAccess();
  if (!(DECIDE_SETUP_VISIBLE && v3)) return <Redirect href={'/decide' as Href} />;
  return <SafetyNetSettings />;
}
