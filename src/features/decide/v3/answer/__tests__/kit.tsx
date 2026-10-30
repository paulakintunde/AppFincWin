/** 05.3-25 test kit: providers at a text scale and an Evaluation builder with Sam's October figures. Mocks stay in each test file. */
import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Evaluation } from '@/engine/decide/v3';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

export function providersAt(scale: number) {
  return function Providers({ children }: { children: React.ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <FontScaleProvider value={scale}>{children}</FontScaleProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  };
}

export function wrap(ui: React.ReactElement, scale = 1) {
  return render(ui, { wrapper: providersAt(scale) });
}

export interface EvOver {
  code: string;
  variant?: string | null;
  facts?: { code: string; values: Record<string, number | string | null> }[];
  split?: { source: string; amount: number }[];
  readyBy?: unknown;
  cash?: unknown;
  low?: { left: number; month: string } | null;
  monthly?: number;
}

/** A minimal Evaluation: only what heroModel reads. Sam: October, $425 left, $300 in a typical month. */
export function ev(o: EvOver): Evaluation {
  return {
    result: {
      code: o.code,
      variant: o.variant ?? null,
      facts: o.facts ?? [],
      split: o.split ?? [],
      readyBy: o.readyBy ?? null,
      band: 7,
    },
    month: { month: '2026-10', monthLeft: 42500, typicalLeft: 30000, low: o.low ?? null },
    purchase: { monthly: o.monthly ?? 0, runningMonthly: 0 },
    cash: o.cash ?? { kind: 'ok' },
  } as unknown as Evaluation;
}

/** The nine answer rows with the evidence each needs. */
export const NINE: { name: string; ev: Evaluation; tone: 'fits' | 'caution' | 'short' | 'input' }[] = [
  { name: 'fits_month', ev: ev({ code: 'fits_month' }), tone: 'fits' },
  {
    name: 'fits_month.low_month',
    ev: ev({ code: 'fits_month', variant: 'low_month', facts: [{ code: 'low_month', values: { month: '2027-01', left: 5000, monthly: 12000 } }] }),
    tone: 'caution',
  },
  { name: 'fits_unspent', ev: ev({ code: 'fits_unspent', facts: [{ code: 'unspent_before_after', values: { before: 90000, after: 40000 } }], split: [{ source: 'month', amount: 42500 }] }), tone: 'fits' },
  {
    name: 'fits_unspent.low_month',
    ev: ev({
      code: 'fits_unspent',
      variant: 'low_month',
      facts: [
        { code: 'unspent_before_after', values: { before: 90000, after: 40000 } },
        { code: 'low_month', values: { month: '2027-01', left: 5000, monthly: 12000 } },
      ],
      split: [{ source: 'month', amount: 42500 }],
    }),
    tone: 'caution',
  },
  {
    name: 'not_yet.payday',
    ev: ev({ code: 'not_yet', variant: 'payday', readyBy: { kind: 'date', date: '2026-11-03' }, cash: { kind: 'payday', until: '2026-11-03', shortBy: 12000 } }),
    tone: 'caution',
  },
  { name: 'not_yet.not_covered', ev: ev({ code: 'not_yet', readyBy: { kind: 'month', month: '2026-12' } }), tone: 'short' },
  { name: 'monthly_short', ev: ev({ code: 'monthly_short', monthly: 45000 }), tone: 'short' },
  {
    name: 'emergency_use',
    ev: ev({ code: 'emergency_use', facts: [{ code: 'emergency_used', values: { used: 150000, months: 3 } }] }),
    tone: 'caution',
  },
  { name: 'needs_input', ev: ev({ code: 'needs_input' }), tone: 'input' },
];
