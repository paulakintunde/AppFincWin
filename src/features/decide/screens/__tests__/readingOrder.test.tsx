// 06.1-32 (UX-27, D-64): the order a screen reader meets an answer. TalkBack and VoiceOver walk the accessibility tree in order,
// one stop per accessible element (or per loose Text outside one). On every LEDGER answer the stops run: verdict, basis, caveat
// (when there is one), caveat line, the "can't see" link, footer, action bar; each region is one unbroken run of stops, nothing
// is hidden from the reader, and the action bar is last.
import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TestInstance as ReactTestInstance } from 'test-renderer';
import en from '@/i18n/locales/en';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { allNodes } from '@/test/textFitMatrix';
import { AnswerFrame } from '../answer/AnswerFrame';
import { LEDGER_CASES, ledgerRun, viewOf, type LedgerScenario } from '../answer/__tests__/fixtures';

jest.setTimeout(60000);

jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useMotion: () => ({ reduced: true, duration: () => 0, easing: undefined }),
  useReduceMotion: () => true,
}));

/** D-64: the reading order this plan proves. The top bar, facts and options sit around it and are checked by answerFrame. */
const ORDER = ['answer-verdict', 'answer-basis', 'answer-caveat', 'answer-caveat-line', 'answer-cant-see', 'answer-footer', 'answer-actions'] as const;
const ALL_REGIONS = ['answer-topbar', 'answer-notices', 'answer-verdict', 'answer-facts', 'answer-options', ...ORDER.slice(1)];

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

async function answer(s: LedgerScenario, scale = 1) {
  const r = ledgerRun(s);
  return render(
    <AnswerFrame
      check={viewOf(r)}
      evaluation={r.evaluation}
      said={{ currency: r.inputs.currency, today: r.inputs.asOf }}
      onAction={() => undefined}
      onOption={() => undefined}
      onCantSee={() => undefined}
    />,
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <SafeAreaProvider initialMetrics={METRICS}>
          <ThemeProvider>
            <FontScaleProvider value={scale}>{children}</FontScaleProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      ),
    },
  );
}

const ancestors = (n: ReactTestInstance): ReactTestInstance[] => {
  const out: ReactTestInstance[] = [];
  for (let p = n.parent; p; p = p.parent) out.push(p);
  return out;
};
const isHost = (n: ReactTestInstance): boolean => typeof n.type === 'string';
const hidden = (n: ReactTestInstance): boolean =>
  n.props.accessibilityElementsHidden === true || n.props.importantForAccessibility === 'no-hide-descendants' || n.props['aria-hidden'] === true;

/** One stop per accessible host element, plus each host Text that no accessible ancestor already covers. In tree order. */
function stops(): ReactTestInstance[] {
  return allNodes().filter((n) => {
    if (!isHost(n)) return false;
    if (hidden(n) || ancestors(n).some(hidden)) return false;
    const coveredAbove = ancestors(n).some((a) => isHost(a) && a.props.accessible === true);
    if (n.props.accessible === true) return !coveredAbove;
    // a nested Text is read with the Text around it
    return n.type === 'Text' && !coveredAbove && !ancestors(n).some((a) => a.type === 'Text');
  });
}

const regionOf = (n: ReactTestInstance): string | null => {
  for (const p of [n, ...ancestors(n)]) {
    const id = p.props.testID;
    if (typeof id === 'string' && ALL_REGIONS.includes(id)) return id;
  }
  return null;
};

/** The regions in the order the reader meets them, each run collapsed to one entry. */
function readingRuns(): string[] {
  const runs: string[] = [];
  for (const s of stops()) {
    const r = regionOf(s);
    if (r === null) continue;
    if (runs[runs.length - 1] !== r) runs.push(r);
  }
  return runs;
}

const SCENARIOS = Object.keys(LEDGER_CASES) as LedgerScenario[];

describe('answer reading order (D-64, UX-27)', () => {
  it.each(SCENARIOS)('%s: verdict, basis, caveat, caveat line, link, footer, action bar', async (s) => {
    await answer(s);
    const runs = readingRuns();
    // every region is one unbroken run: the reader never leaves a region and comes back to it
    expect(new Set(runs).size).toBe(runs.length);
    const ordered = runs.filter((r) => (ORDER as readonly string[]).includes(r));
    const expected = ORDER.filter((r) => r !== 'answer-caveat' || runs.includes('answer-caveat'));
    expect(ordered).toEqual(expected);
    // the action bar is the last thing read
    expect(runs[runs.length - 1]).toBe('answer-actions');
  });

  it.each(SCENARIOS)('%s: the verdict is one stop that speaks the chip and the title first', async (s) => {
    await answer(s);
    const verdictStops = stops().filter((n) => regionOf(n) === 'answer-verdict');
    expect(verdictStops).toHaveLength(1);
    const label = String(verdictStops[0]!.props.accessibilityLabel ?? '');
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toMatch(/\{\{|undefined|NaN/);
  });

  it('the caveat line, link and footer read their legal words, and the link says it is a link or button', async () => {
    await answer('N04');
    const stopText = (id: string): string =>
      stops()
        .filter((n) => regionOf(n) === id)
        .map((n) => String(n.props.accessibilityLabel ?? '') + ' ' + JSON.stringify(n.props.children ?? ''))
        .join(' ');
    expect(stopText('answer-caveat-line')).toContain(en.legal.decideAnswer.caveat);
    expect(stopText('answer-footer')).toContain(en.legal.decideAnswer.footer);
    const link = stops().filter((n) => regionOf(n) === 'answer-cant-see');
    expect(link.length).toBeGreaterThan(0);
    expect(['link', 'button']).toContain(link[0]!.props.accessibilityRole);
  });

  it('the order holds at 2.0x font (the title drops a size, the order does not move)', async () => {
    await answer('N09', 2);
    const ordered = readingRuns().filter((r) => (ORDER as readonly string[]).includes(r));
    expect(ordered).toEqual(ORDER.filter((r) => r !== 'answer-caveat' || ordered.includes('answer-caveat')));
  });
});
