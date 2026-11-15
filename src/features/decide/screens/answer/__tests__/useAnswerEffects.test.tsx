// 06.1-47 (B-2): the answer's seen state and history row are written once per (check id, verdict code, variant), however many
// times the answer re-renders, and again once when the verdict changes. Results are real engine runs (fixtures.ts).
import { renderHook } from '@testing-library/react-native';
import type { Result } from '@/engine/decide/v3';
import type { DecideCheckRow } from '@/db/decideChecks';
import { useAnswerEffects, type AnswerEffectWrites } from '../useAnswerEffects';
import { ledgerRun } from './fixtures';

const mockTrack = jest.fn();
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
jest.mock('@/ui/haptics', () => ({ hapticWarning: jest.fn() }));

const ROW = { id: 'c1' } as unknown as DecideCheckRow;
/** A new-but-equal copy of a result, as a fresh judge gives on each render. */
const copy = (r: Result): Result => ({ ...r, facts: [...r.facts] });

function writes(): AnswerEffectWrites & { markSeen: jest.Mock; recordHistory: jest.Mock; saveAnswer: jest.Mock } {
  return { markSeen: jest.fn(() => true), recordHistory: jest.fn(() => true), saveAnswer: jest.fn(() => true) };
}

beforeEach(() => mockTrack.mockClear());

describe('useAnswerEffects (06.1-47, B-2)', () => {
  it('writes seen and history once across 5 re-renders with new-but-equal results', async () => {
    const base = ledgerRun('N02').evaluation.result;
    const w = writes();
    const { rerender } = await renderHook(({ result, ws }: { result: Result; ws: AnswerEffectWrites }) => useAnswerEffects({ row: { ...ROW }, result, writes: ws, inputsKey: 'k1' }), {
      initialProps: { result: copy(base), ws: { ...w } },
    });
    for (let i = 0; i < 5; i += 1) await rerender({ result: copy(base), ws: { ...w } });
    expect(w.markSeen).toHaveBeenCalledTimes(1);
    expect(w.recordHistory).toHaveBeenCalledTimes(1);
    expect(w.recordHistory).toHaveBeenCalledWith(expect.objectContaining({ checkId: 'c1' }));
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('a changed verdict code writes again, once', async () => {
    const first = ledgerRun('N02').evaluation.result;
    const second = ledgerRun('N09').evaluation.result;
    expect(second.code).not.toBe(first.code);
    const w = writes();
    const { rerender } = await renderHook(({ result }: { result: Result }) => useAnswerEffects({ row: ROW, result, writes: w, inputsKey: 'k1' }), { initialProps: { result: first } });
    await rerender({ result: copy(second) });
    await rerender({ result: copy(second) });
    await rerender({ result: copy(second) });
    expect(w.markSeen).toHaveBeenCalledTimes(2);
    expect(w.recordHistory).toHaveBeenCalledTimes(2);
    expect(w.recordHistory.mock.calls[1]![0].result.code).toBe(second.code);
  });

  it('nothing is written while the result is loading', async () => {
    const w = writes();
    await renderHook(() => useAnswerEffects({ row: ROW, result: null, writes: w, inputsKey: 'k1' }));
    expect(w.markSeen).not.toHaveBeenCalled();
    expect(w.recordHistory).not.toHaveBeenCalled();
  });

  it('06.1-78: stores the shown answer once across re-renders, as the stored seen state', async () => {
    const base = ledgerRun('N02').evaluation.result;
    expect(base.code).not.toBe('needs_input');
    const w = writes();
    const { rerender } = await renderHook(({ result }: { result: Result }) => useAnswerEffects({ row: ROW, result, writes: w, inputsKey: 'k1' }), { initialProps: { result: copy(base) } });
    for (let i = 0; i < 4; i += 1) await rerender({ result: copy(base) });
    expect(w.saveAnswer).toHaveBeenCalledTimes(1);
    expect(w.saveAnswer).toHaveBeenCalledWith(ROW, expect.objectContaining({ v: 3, code: base.code, variant: base.variant, inputsKey: 'k1' }));
  });

  it('06.1-78: with nothing stored yet, a changed answer is stored again, once', async () => {
    const first = ledgerRun('N02').evaluation.result;
    const second = ledgerRun('N09').evaluation.result;
    const w = writes();
    const { rerender } = await renderHook(({ result }: { result: Result }) => useAnswerEffects({ row: ROW, result, writes: w, inputsKey: 'k1' }), { initialProps: { result: first } });
    await rerender({ result: copy(second) });
    await rerender({ result: copy(second) });
    expect(w.saveAnswer).toHaveBeenCalledTimes(2);
    expect(w.saveAnswer.mock.calls[1]![1].code).toBe(second.code);
  });

  it('06.1-78: an ask, a not-ready answer and a loading answer are not stored', async () => {
    const base = ledgerRun('N02').evaluation.result;
    const w = writes();
    await renderHook(() => useAnswerEffects({ row: ROW, result: { ...base, code: 'needs_input' } as Result, writes: w, inputsKey: 'k1' }));
    await renderHook(() => useAnswerEffects({ row: ROW, result: { ...base, readiness: { ...(base.readiness ?? {}), ready: false } } as Result, writes: w, inputsKey: 'k1' }));
    await renderHook(() => useAnswerEffects({ row: ROW, result: null, writes: w, inputsKey: 'k1' }));
    await renderHook(() => useAnswerEffects({ row: null, result: base, writes: w, inputsKey: 'k1' }));
    expect(w.saveAnswer).not.toHaveBeenCalled();
  });

  it('06.1-78: a failing store does not break the answer, and writes without a store still work', async () => {
    const base = ledgerRun('N02').evaluation.result;
    const w = writes();
    w.saveAnswer.mockImplementation(() => {
      throw new Error('offline');
    });
    await renderHook(() => useAnswerEffects({ row: ROW, result: base, writes: w, inputsKey: 'k1' }));
    expect(w.markSeen).toHaveBeenCalledTimes(1);
    const bare = { markSeen: jest.fn(() => true), recordHistory: jest.fn(() => true) };
    await renderHook(() => useAnswerEffects({ row: ROW, result: base, writes: bare, inputsKey: 'k1' }));
    expect(bare.markSeen).toHaveBeenCalledTimes(1);
  });

  // 06.1-81 (review item 3, owner RV-3): keep the first answer. answer_v3 is stored when the check has none, and again only after
  // its inputs were edited (the inputs fingerprint moved); never on a recompute at reopen, and never once the check is decided.
  describe('06.1-81: keep the first answer', () => {
    const first = ledgerRun('N02').evaluation.result;
    const second = ledgerRun('N09').evaluation.result;
    const storedFrom = (r: Result, inputsKey?: string) => ({ v: 3, code: r.code, variant: r.variant, readyBy: r.readyBy, unspentAfter: null, lineFacts: [], ...(inputsKey === undefined ? {} : { inputsKey }) });
    const rowWith = (over: Record<string, unknown>) => ({ ...ROW, status: 'open', ...over }) as unknown as DecideCheckRow;

    it('a reopened check whose answer was recomputed differently keeps the stored answer', async () => {
      const w = writes();
      await renderHook(() => useAnswerEffects({ row: rowWith({ answer_v3: storedFrom(first, 'k1') }), result: second, writes: w, inputsKey: 'k1' }));
      expect(w.saveAnswer).not.toHaveBeenCalled();
      expect(w.markSeen).toHaveBeenCalledTimes(1);
    });

    // 06.1-81 re-review C: an answer stored before fingerprints carries no inputsKey and no time, and row.updated_at moves on every
    // write (draft saves, seen state, the answer itself), so nothing tells an edit made in the stepper before this reopen from a
    // recompute on newer records. Such an answer is stored again once, with the fingerprint of the inputs it is shown for; from
    // then on the keep-the-first-answer rule applies as for any fingerprinted answer.
    it('an answer stored before fingerprints, for a check edited in the stepper before reopening, is replaced with the shown answer', async () => {
      const w = writes();
      const row = rowWith({ answer_v3: storedFrom(first) });
      await renderHook(() => useAnswerEffects({ row, result: second, writes: w, inputsKey: 'k2' }));
      expect(w.saveAnswer).toHaveBeenCalledTimes(1);
      expect(w.saveAnswer).toHaveBeenCalledWith(row, expect.objectContaining({ code: second.code, inputsKey: 'k2' }));
    });

    it('an answer stored before fingerprints that matches the shown answer is stamped with its fingerprint, once', async () => {
      const w = writes();
      const row = rowWith({ answer_v3: storedFrom(first) });
      const { rerender } = await renderHook(({ result }: { result: Result }) => useAnswerEffects({ row, result, writes: w, inputsKey: 'k1' }), {
        initialProps: { result: first },
      });
      await rerender({ result: copy(first) });
      expect(w.saveAnswer).toHaveBeenCalledTimes(1);
      expect(w.saveAnswer).toHaveBeenCalledWith(row, expect.objectContaining({ code: first.code, inputsKey: 'k1' }));
    });

    it('once stamped, a reopen with the same inputs keeps the stored answer', async () => {
      const w = writes();
      await renderHook(() => useAnswerEffects({ row: rowWith({ answer_v3: storedFrom(first, 'k1') }), result: second, writes: w, inputsKey: 'k1' }));
      expect(w.saveAnswer).not.toHaveBeenCalled();
    });

    it('a decided check with an answer stored before fingerprints is never touched', async () => {
      const w = writes();
      await renderHook(() => useAnswerEffects({ row: rowWith({ status: 'bought', answer_v3: storedFrom(first) }), result: second, writes: w, inputsKey: 'k2' }));
      expect(w.saveAnswer).not.toHaveBeenCalled();
    });

    it('an answer stored for other inputs (the check was edited) is replaced, with the new fingerprint', async () => {
      const w = writes();
      const row = rowWith({ answer_v3: storedFrom(first, 'k0') });
      await renderHook(() => useAnswerEffects({ row, result: second, writes: w, inputsKey: 'k1' }));
      expect(w.saveAnswer).toHaveBeenCalledTimes(1);
      expect(w.saveAnswer).toHaveBeenCalledWith(row, expect.objectContaining({ code: second.code, inputsKey: 'k1' }));
    });

    it('an edit made on the open answer stores the new answer once', async () => {
      const w = writes();
      const row = rowWith({ answer_v3: storedFrom(first, 'k1') });
      const { rerender } = await renderHook(({ result, inputsKey }: { result: Result; inputsKey: string | null }) => useAnswerEffects({ row, result, writes: w, inputsKey }), {
        initialProps: { result: first, inputsKey: 'k1' as string | null },
      });
      expect(w.saveAnswer).not.toHaveBeenCalled();
      // The judge lags the edit: nothing is stored while the shown answer is for the old inputs.
      await rerender({ result: first, inputsKey: null });
      expect(w.saveAnswer).not.toHaveBeenCalled();
      await rerender({ result: copy(second), inputsKey: 'k2' });
      await rerender({ result: copy(second), inputsKey: 'k2' });
      expect(w.saveAnswer).toHaveBeenCalledTimes(1);
      expect(w.saveAnswer).toHaveBeenCalledWith(row, expect.objectContaining({ code: second.code, inputsKey: 'k2' }));
    });

    it('over an answer stored before fingerprints: stamped on open, then the edit is stored too', async () => {
      const w = writes();
      const row = rowWith({ answer_v3: storedFrom(first) });
      const { rerender } = await renderHook(({ result, inputsKey }: { result: Result; inputsKey: string | null }) => useAnswerEffects({ row, result, writes: w, inputsKey }), {
        initialProps: { result: first, inputsKey: 'k1' as string | null },
      });
      await rerender({ result: first, inputsKey: null });
      await rerender({ result: copy(second), inputsKey: 'k2' });
      await rerender({ result: copy(second), inputsKey: 'k2' });
      expect(w.saveAnswer).toHaveBeenCalledTimes(2);
      expect(w.saveAnswer).toHaveBeenNthCalledWith(1, row, expect.objectContaining({ code: first.code, inputsKey: 'k1' }));
      expect(w.saveAnswer).toHaveBeenNthCalledWith(2, row, expect.objectContaining({ code: second.code, inputsKey: 'k2' }));
    });

    it('a check with no stored answer leaves Draft: the shown answer is stored with its fingerprint', async () => {
      const w = writes();
      await renderHook(() => useAnswerEffects({ row: rowWith({ answer_v3: null }), result: first, writes: w, inputsKey: 'k1' }));
      expect(w.saveAnswer).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ code: first.code, inputsKey: 'k1' }));
    });

    it.each(['bought', 'waiting', 'passed'])('a %s check never has its answer stored or replaced', async (status) => {
      const w = writes();
      await renderHook(() => useAnswerEffects({ row: rowWith({ status, answer_v3: null }), result: first, writes: w, inputsKey: 'k1' }));
      await renderHook(() => useAnswerEffects({ row: rowWith({ status, answer_v3: storedFrom(first, 'k0') }), result: second, writes: w, inputsKey: 'k1' }));
      expect(w.saveAnswer).not.toHaveBeenCalled();
    });
  });
});
