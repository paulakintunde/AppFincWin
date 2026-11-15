// 06.1-23: the answer route. Thin: the id (and an optional compare side) come from the URL, so they are checked before the screen.
import { useLocalSearchParams } from 'expo-router';
import { CheckNotFound } from '@/features/decide/screens/ui/CheckNotFound';
import { isUuid, oneParam } from '@/features/navigation/routeParams';
import { AnswerRoute } from '@/shell/decide/AnswerRoute';

export default function AnswerPage() {
  const p = useLocalSearchParams<{ id: string; side?: string }>();
  const id = oneParam(p.id);
  if (!isUuid(id)) return <CheckNotFound />;
  const side = oneParam(p.side);
  return <AnswerRoute id={id} side={side === 'cash' || side === 'installments' ? side : null} />;
}
