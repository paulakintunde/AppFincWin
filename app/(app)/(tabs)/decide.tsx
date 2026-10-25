import { DECIDE_OPEN } from '@/features/decide/availability';
import { DecideComingSoonScreen } from '@/features/decide/home/DecideComingSoonScreen';
import { DecideHomeScreen } from '@/features/decide/home/DecideHomeScreen';

export default function DecideRoute() {
  return DECIDE_OPEN ? <DecideHomeScreen /> : <DecideComingSoonScreen />;
}
