// 10-21: a tiny signal so the gate re-reads the lock settings when setup or Security changes them mid-session.
type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyLockChanged(): void {
  for (const l of [...listeners]) l();
}

export function subscribeLockChanged(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
