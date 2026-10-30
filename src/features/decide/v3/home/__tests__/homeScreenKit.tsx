// 05.3-39: shared state and test doubles for the HomeScreen tests. Jest factories reach it through requireActual.
import React from 'react';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { Evaluation } from '@/engine/decide/v3';
import { samEvaluation, fakeFormat } from './homeCardsTestKit';

export { fakeFormat };

export interface HomeState {
  status: 'loading' | 'error' | 'ready';
  rows: DecideCheckRow[];
  byId: Map<string, Evaluation>;
  withoutRefunds: Map<string, Evaluation>;
  missing: string[];
  setup: 'done' | 'not_started' | 'rough';
  pots: { id: string; name: string; saved: number }[];
  refetch: jest.Mock;
}

export const homeState: HomeState = {
  status: 'ready',
  rows: [],
  byId: new Map(),
  withoutRefunds: new Map(),
  missing: [],
  setup: 'done',
  pots: [],
  refetch: jest.fn(),
};

export function resetHome(): void {
  homeState.status = 'ready';
  homeState.rows = [];
  homeState.byId = new Map();
  homeState.withoutRefunds = new Map();
  homeState.missing = [];
  homeState.setup = 'done';
  homeState.pots = [];
  homeState.refetch = jest.fn();
}

export function homeEvaluation(missing: string[]): Evaluation {
  const base = samEvaluation();
  return { ...base, result: { code: 'fits_month', variant: null, readiness: { ready: missing.length === 0, missing } } } as unknown as Evaluation;
}

export function useChecksV3Double(): unknown {
  const s = homeState;
  return {
    status: s.status,
    rows: s.rows,
    inputs: null,
    home: s.status === 'ready' ? homeEvaluation(s.missing) : null,
    byId: s.byId,
    withoutRefunds: s.withoutRefunds,
    refetch: s.refetch,
  };
}

export function usePotsReadDouble(): unknown {
  return {
    status: 'ready',
    model: { live: homeState.pots.map((p) => ({ kind: 'pot', saved: p.saved, row: { id: p.id, name: p.name } })), done: [] },
  };
}

export function setupFactsDouble(): unknown {
  return homeState.setup === 'not_started' ? { fake: true } : { fake: false };
}

export const TabRootDouble = ({ children, trailing, title }: { children?: React.ReactNode; trailing?: React.ReactNode; title?: string }): React.JSX.Element => {
  const { Text } = jest.requireActual('react-native');
  return (
    <>
      <Text>{title}</Text>
      {trailing}
      {children}
    </>
  );
};
