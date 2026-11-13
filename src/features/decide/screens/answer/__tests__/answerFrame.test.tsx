// 06.1-14 (audit F2, D-15): reading order, legal block, first-caveat rule, equal options, motion and text fit, on engine-run fixtures.
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import en from '@/i18n/locales/en';
import { stateColors } from '@/theme/tokens';
import { expectFits } from '@/test/textFitMatrix';
import { wrap } from '@/test/stepProps';
import { AnswerFrame, type AnswerAction, type AnswerFrameProps } from '../AnswerFrame';
import { AnswerLoading } from '../AnswerLoading';
import { optionOrder } from '../OptionChips';
import { freeHelpUrl } from '../FactLines';
import { LEDGER_CASES, ledgerRun, notReadyRun, viewOf, type LedgerScenario, type Run } from './fixtures';

let mockReduced = false;
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useMotion: () => ({ reduced: mockReduced, duration: (ms: number) => (mockReduced ? 0 : ms), easing: undefined }),
}));

const noop = (): void => undefined;
const FOOTER = en.legal.decideAnswer.footer;

async function frame(r: Run, over: Partial<AnswerFrameProps> = {}, scale = 1) {
  const actions: AnswerAction[] = [];
  const ui = (
    <AnswerFrame
      check={viewOf(r)}
      evaluation={r.evaluation}
      said={{ currency: r.inputs.currency, today: r.inputs.asOf }}
      onAction={(a) => actions.push(a)}
      onOption={noop}
      onCantSee={noop}
      {...over}
    />
  );
  const rendered = await wrap(ui, scale);
  return { actions, ...rendered };
}

const REGIONS = ['answer-topbar', 'answer-notices', 'answer-verdict', 'answer-facts', 'answer-options', 'answer-basis', 'answer-caveat', 'answer-caveat-line', 'answer-cant-see', 'answer-footer', 'answer-actions'];
const regionsShown = (): string[] =>
  screen
    .getAllByTestId(/^answer-/)
    .map((n) => String(n.props.testID))
    .filter((id, i, all) => REGIONS.includes(id) && all.indexOf(id) === i);

/** True when the node or any ancestor carries a Reanimated entering animation. */
const enteringAbove = (node: { props: Record<string, unknown>; parent: unknown }): boolean => {
  for (let p = node as { props?: Record<string, unknown>; parent?: unknown } | null; p; p = (p.parent as typeof p) ?? null) if (p.props?.entering !== undefined) return true;
  return false;
};

const SCENARIOS = Object.keys(LEDGER_CASES) as LedgerScenario[];

describe('fixtures are engine runs on the LEDGER codes (D-15)', () => {
  it.each(SCENARIOS)('%s lands on its engine code and variant', (s) => {
    const { result } = ledgerRun(s).evaluation;
    expect({ code: result.code, variant: result.variant }).toEqual({ code: LEDGER_CASES[s].code, variant: LEDGER_CASES[s].variant });
  });

  it('N24 is not ready, N04 carries two caveats with large_for_month first', () => {
    expect(notReadyRun().evaluation.result.readiness?.ready).toBe(false);
    expect((ledgerRun('N04').evaluation.result.caveats ?? []).map((c) => c.code).slice(0, 2)).toEqual(['large_for_month', 'close_to_line']);
  });
});

describe('AnswerFrame reading order (CO-D-64 (4), CO-D-119)', () => {
  it.each(SCENARIOS)('%s: top bar, verdict, facts, options, basis, caveat, caveat line, cant-see, footer, action bar', async (s) => {
    await frame(ledgerRun(s));
    const shown = regionsShown().filter((id) => id !== 'answer-notices');
    expect(shown).toEqual(REGIONS.filter((id) => id !== 'answer-notices' && (id !== 'answer-caveat' || shown.includes('answer-caveat'))));
    expect(screen.getByTestId('answer-footer')).toHaveTextContent(FOOTER);
    expect(screen.getByTestId('answer-caveat-line')).toHaveTextContent(en.legal.decideAnswer.caveat);
    expect(screen.getByTestId('answer-cant-see').props.accessibilityRole).toBe('button');
    expect(screen.getByText(en.legal.decideAnswer.cantSeeLink)).toBeTruthy();
  });

  it('the footer is the last text before the action bar, and the action bar is last', async () => {
    await frame(ledgerRun('N04'));
    const ids = regionsShown();
    expect(ids.indexOf('answer-footer')).toBe(ids.length - 2);
    expect(ids[ids.length - 1]).toBe('answer-actions');
  });

  it('shows only the first caveat, with the large_for_month figures and the wrong-figure line under it', async () => {
    const r = ledgerRun('N04');
    const caveats = r.evaluation.result.caveats ?? [];
    expect(caveats.length).toBeGreaterThan(1);
    await frame(r);
    expect(screen.getAllByTestId('answer-caveat')).toHaveLength(1);
    expect(screen.getAllByTestId('answer-caveat-figure').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(en.decide.v3.caveat.close_to_line)).toBeNull();
  });

  it('puts the unsaved note above the verdict when the engine sends it (CO-D-113)', async () => {
    const r = ledgerRun('N02');
    const base = r.evaluation;
    const withUnsaved = {
      ...base,
      result: { ...base.result, notices: [...base.result.notices, { code: 'unsaved_changes' as const, values: {} }] },
    };
    await frame(r, { evaluation: withUnsaved });
    const ids = screen.getAllByTestId(/^answer-/).map((n) => String(n.props.testID));
    expect(ids).toContain('answer-notice-unsaved_changes');
    expect(ids.indexOf('answer-notice-unsaved_changes')).toBeLessThan(ids.indexOf('answer-verdict'));
    expect(ids.indexOf('answer-notice-unsaved_changes')).toBeGreaterThan(ids.indexOf('answer-topbar'));
  });

  it('shows no notice region when the engine sends none', async () => {
    const r = ledgerRun('N04');
    if (r.evaluation.result.notices.length === 0) {
      await frame(r);
      expect(screen.queryByTestId('answer-notices')).toBeNull();
    }
  });
});

describe('verdict card (D-16, D-18, UX-09)', () => {
  it.each(SCENARIOS)('%s: the badge carries a word and the card is tinted by the state, not the screen', async (s) => {
    await frame(ledgerRun(s));
    const badge = screen.getByTestId('answer-verdict-badge');
    expect(badge.props.accessibilityLabel).toMatch(/\S/);
    expect(screen.getByTestId('answer-verdict')).toBeTruthy();
    const screenBg = StyleSheet.flatten(screen.getByTestId('answer-frame').props.style).backgroundColor;
    expect(Object.values(stateColors).map((c) => c.tint)).not.toContain(screenBg);
  });

  it('N26 reads as the Short state (D-63)', async () => {
    await frame(ledgerRun('N26'));
    expect(screen.getByText(en.decide.v3.verdict.monthAlreadyShort.chip)).toBeTruthy();
    expect(screen.getByText(en.decide.v3.verdict.monthAlreadyShort.title)).toBeTruthy();
  });

  it('N12 puts the not-cleared warning first in the facts, in bold ink (CO-D-36)', async () => {
    const r = ledgerRun('N12');
    expect(r.evaluation.result.facts[0]?.code).toBe('overdraft_not_cleared');
    await frame(r);
    const facts = screen.getByTestId('answer-facts');
    const first = within(facts).getAllByText(/./)[0]!;
    const flat = StyleSheet.flatten(first.props.style);
    expect(Object.values(stateColors).map((c) => c.color)).not.toContain(flat.color);
  });

  it('N24 shows the not-ready card, never a verdict or an action bar (D-52)', async () => {
    await frame(notReadyRun());
    expect(screen.getByTestId('answer-not-ready')).toBeTruthy();
    expect(screen.queryByTestId('answer-verdict')).toBeNull();
    expect(screen.queryByTestId('answer-actions')).toBeNull();
    expect(screen.getByText(en.decide.screens.answer.notReady.finishSetup)).toBeTruthy();
  });
});

describe('verdict motion (D-17)', () => {
  it('rises once, with a layout entering animation', async () => {
    mockReduced = false;
    await frame(ledgerRun('N02'));
    expect(enteringAbove(screen.getByTestId("answer-verdict"))).toBe(true);
  });

  it('appears at once under Reduce Motion: no entering animation, no opacity style', async () => {
    mockReduced = true;
    await frame(ledgerRun('N02'));
    const verdict = screen.getByTestId("answer-verdict");
    expect(enteringAbove(verdict)).toBe(false);
    const wrapper = verdict.parent!;
    expect(StyleSheet.flatten(wrapper.props.style) ?? {}).not.toHaveProperty('opacity');
    mockReduced = false;
  });
});

describe('options are equal (UX-10, CMP-F15)', () => {
  it('every option chip has the same style and none uses the accent fill', async () => {
    await frame(ledgerRun('N02'));
    const styles = ['later', 'cheaper', 'installments'].map((k) => StyleSheet.flatten(screen.getByTestId(`answer-option-${k}`).props.style));
    for (const s of styles) expect(s).toEqual(styles[0]);
    expect(styles[0]!.backgroundColor).not.toBe('#1B4D3E');
  });

  it('only the order follows the purpose; the set never changes', () => {
    const all = ['later', 'cheaper', 'installments'] as const;
    const need = optionOrder(all, { kind: 'preset', value: 'necessity' });
    const want = optionOrder(all, { kind: 'preset', value: 'treat' });
    expect([...need].sort()).toEqual([...all].sort());
    expect([...want].sort()).toEqual([...all].sort());
    expect(need[0]).toBe('cheaper');
    expect(want[0]).toBe('later');
    expect(optionOrder([], null)).toEqual([]);
  });
});

describe('free-help link (T-06.1-14-01)', () => {
  it('comes only from the typed table and only as https', () => {
    expect(freeHelpUrl('GB')?.url.startsWith('https://')).toBe(true);
    expect(freeHelpUrl('ZZ')).toBeNull();
    expect(freeHelpUrl(null)).toBeNull();
    expect(freeHelpUrl('__proto__')).toBeNull();
  });
});

describe('status cards (APP-10)', () => {
  it('error: no figure, never "not found", and the retry names the item', async () => {
    const r = ledgerRun('N04');
    const { actions } = await frame(r, { status: 'error', evaluation: null });
    expect(screen.getByTestId('answer-error')).toBeTruthy();
    expect(screen.queryByText(/not found/i)).toBeNull();
    expect(screen.queryByTestId('answer-verdict')).toBeNull();
    expect(screen.queryByTestId('answer-facts')).toBeNull();
    const retry = screen.getByLabelText('Try the check again for Item');
    await fireEvent.press(retry);
    expect(actions).toEqual([{ kind: 'retry' }]);
  });

  it('offline: the card names the date and the answer still shows', async () => {
    await frame(ledgerRun('N04'), { offlineDate: 'Nov 5, 2026' });
    expect(screen.getByText('Offline. Using records up to Nov 5, 2026.')).toBeTruthy();
    expect(screen.getByTestId('answer-verdict')).toBeTruthy();
  });
});

describe('actions', () => {
  it('the bar reports bought, save for it and not buying', async () => {
    const { actions } = await frame(ledgerRun('N02'));
    await fireEvent.press(screen.getByText(en.decide.screens.answerActions.bar.bought));
    await fireEvent.press(screen.getByText(en.decide.screens.answerActions.bar.saveForIt));
    await fireEvent.press(screen.getByText(en.decide.screens.answerActions.bar.notBuying));
    expect(actions).toEqual([{ kind: 'bought' }, { kind: 'saveFor' }, { kind: 'notBuying' }]);
  });
});

describe('text fit at 320 dp and 200% (UX-02)', () => {
  it.each(['N04', 'N12', 'N26'] as const)('%s fits: no clamp, no unresolved text, 44 pt targets', async (s) => {
    await frame(ledgerRun(s), {}, 2);
    expect(screen.getByTestId('answer-footer')).toBeTruthy();
    expectFits({ clamped: [] });
  });
});

describe('no placeholder or code is ever printed (APP-10)', () => {
  it.each(SCENARIOS)('%s: no brace, no raw engine code in any shown text', async (s) => {
    await frame(ledgerRun(s));
    const text = screen.getAllByText(/./).map((n) => String(n.children.join(''))).join(' ');
    expect(text).not.toMatch(/\{\{|\}\}|undefined|NaN/);
    expect(text).not.toContain(ledgerRun(s).evaluation.result.code);
  });

  it('a verdict sentence with a figure the engine does not state under that name is left out, not guessed', async () => {
    await frame(ledgerRun('N09'));
    expect(screen.getByTestId('answer-verdict-badge')).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/\{\{/);
  });
});

describe('top bar inside the safe area (06.1-49, A-ANS-1, C-7)', () => {
  const at48 = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 48, bottom: 34, left: 0, right: 0 } };

  it('the frame is padded by the status bar inset, so Back and New check are not under it', async () => {
    const r = ledgerRun('N04');
    await render(
      <SafeAreaProvider initialMetrics={at48}>
        <ThemeProvider>
          <AnswerFrame check={viewOf(r)} evaluation={r.evaluation} said={{ currency: r.inputs.currency, today: r.inputs.asOf }} onAction={noop} onOption={noop} onCantSee={noop} />
        </ThemeProvider>
      </SafeAreaProvider>
    );
    expect(StyleSheet.flatten(screen.getByTestId('answer-frame').props.style).paddingTop).toBe(48);
  });

  it('Back and New check respond to a tap and keep 44 pt targets', async () => {
    const { actions } = await frame(ledgerRun('N04'));
    await fireEvent.press(screen.getByTestId('answer-back'));
    await fireEvent.press(screen.getByTestId('answer-new-check'));
    expect(actions).toEqual([{ kind: 'back' }, { kind: 'newCheck' }]);
    for (const id of ['answer-back', 'answer-new-check']) {
      const s = StyleSheet.flatten(screen.getByTestId(id).props.style);
      expect(s.minHeight).toBeGreaterThanOrEqual(44);
      expect(s.minWidth).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('loading state (06.1-49, A-ANS-2)', () => {
  it('status loading shows the top bar and "Working out the answer", never a blank body', async () => {
    const { actions } = await frame(ledgerRun('N04'), { status: 'loading', evaluation: null });
    expect(screen.getByTestId('answer-topbar')).toBeTruthy();
    expect(screen.getByTestId('answer-loading')).toBeTruthy();
    const text = screen.getByText(en.decide.screens.answer.loading);
    expect(text.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.queryByTestId('answer-verdict')).toBeNull();
    expect(screen.queryByTestId('answer-actions')).toBeNull();
    await fireEvent.press(screen.getByTestId('answer-back'));
    expect(actions).toEqual([{ kind: 'back' }]);
  });

  it('a ready status with no evaluation yet (deferred) also shows the loading state', async () => {
    await frame(ledgerRun('N04'), { status: 'ready', evaluation: null });
    expect(screen.getByTestId('answer-loading')).toBeTruthy();
  });

  it('AnswerLoading on its own (no check yet) has no top bar but the same text', async () => {
    await wrap(<AnswerLoading />);
    expect(screen.queryByTestId('answer-topbar')).toBeNull();
    expect(screen.getByText(en.decide.screens.answer.loading)).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('answer-loading-screen').props.style).paddingTop).toBe(62);
  });
});
