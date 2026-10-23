import { useLocalSearchParams } from 'expo-router';
import { CheckFlowScreen, CheckNotFound } from '@/features/decide/check/CheckFlowScreen';
import type { StepNumber } from '@/features/decide/check/stepTypes';
import { CommitMutationsProvider } from '@/shell/decide/CommitMutationsProvider';
import { isUuid, oneParam } from '@/features/navigation/routeParams';

// T-05-30-01: the id, step and kind come from the URL or a notification, so each is checked before it reaches the screen.
const STEPS = ['1', '2', '3', '4', '5'] as const;

export default function CheckRoute() {
  const p = useLocalSearchParams<{ id: string; step?: string; kind?: string; cleared?: string; clearedStep?: string }>();
  const id = oneParam(p.id);
  if (!isUuid(id)) return <CheckNotFound />;
  const step = oneParam(p.step);
  const initialStep = step !== undefined && (STEPS as readonly string[]).includes(step) ? (Number(step) as StepNumber) : null;
  const kind = oneParam(p.kind) === 'invest' ? 'invest' : 'buy';
  // 05-75 (T-05-75-01): the cleared check's id and step are validated; anything else is dropped.
  const clearedParam = oneParam(p.cleared);
  const cleared = isUuid(clearedParam) ? clearedParam : null;
  const clearedStepParam = oneParam(p.clearedStep);
  const clearedStep = clearedStepParam !== undefined && (STEPS as readonly string[]).includes(clearedStepParam) ? (Number(clearedStepParam) as StepNumber) : null;
  // 05-29: Go ahead, Wait and Pass are injected here (the decide feature may not import the write path).
  return (
    <CommitMutationsProvider>
      <CheckFlowScreen id={id} initialStep={initialStep} kind={kind} cleared={cleared} clearedStep={clearedStep} />
    </CommitMutationsProvider>
  );
}
