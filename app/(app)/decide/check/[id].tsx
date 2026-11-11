import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import { CheckNotFound } from '@/features/decide/screens/ui/CheckNotFound';
import { isUuid, oneParam } from '@/features/navigation/routeParams';

// 06.1-28 D-05: old path. Notification payloads and old links keep working: the answer for the check, or the matching stepper step
// when the old link named step 1 to 3. The id is checked before it goes into the new path (T-05-30-01).
const STEP_PATH: Readonly<Record<string, string>> = { '1': 'kind', '2': 'price', '3': 'costs' };

export default function CheckRoute() {
  const p = useLocalSearchParams<{ id: string; step?: string }>();
  const id = oneParam(p.id);
  if (!isUuid(id)) return <CheckNotFound />;
  const step = oneParam(p.step);
  const stepPath = step === undefined ? undefined : STEP_PATH[step];
  const href = stepPath === undefined ? `/decide/answer/${id}` : `/decide/check/${stepPath}?id=${id}`;
  return <Redirect href={href as Href} />;
}
