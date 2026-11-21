import { useLocalSearchParams } from 'expo-router';
import { LeaveScreen, type LeaveMode } from '@/features/household/leave/LeaveScreen';

// 09-20: ?mode=solo opens "Leave and continue on Solo"; ?mode=own ("Start your own plan") first says what starting it means.
export default function HouseholdLeaveRoute() {
  const params = useLocalSearchParams<{ mode?: string | string[] }>();
  const raw = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const mode: LeaveMode | undefined = raw === 'solo' || raw === 'own' ? raw : undefined;
  return <LeaveScreen mode={mode} />;
}
