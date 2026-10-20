import { useLocalSearchParams } from 'expo-router';
import { CheckFlowScreen, CheckNotFound } from '@/features/decide/check/CheckFlowScreen';
import type { StepNumber } from '@/features/decide/check/stepTypes';

// T-05-30-01: the id, step and kind come from the URL or a notification, so each is checked before it reaches the screen.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEPS = ['1', '2', '3', '4', '5'] as const;

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default function CheckRoute() {
  const p = useLocalSearchParams<{ id: string; step?: string; kind?: string }>();
  const id = one(p.id);
  if (id === undefined || !UUID_RE.test(id)) return <CheckNotFound />;
  const step = one(p.step);
  const initialStep = step !== undefined && (STEPS as readonly string[]).includes(step) ? (Number(step) as StepNumber) : null;
  const kind = one(p.kind) === 'invest' ? 'invest' : 'buy';
  return <CheckFlowScreen id={id} initialStep={initialStep} kind={kind} />;
}
