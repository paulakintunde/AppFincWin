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

function writes(): AnswerEffectWrites & { markSeen: jest.Mock; recordHistory: jest.Mock } {
  return { markSeen: jest.fn(() => true), recordHistory: jest.fn(() => true) };
}

beforeEach(() => mockTrack.mockClear());

describe('useAnswerEffects (06.1-47, B-2)', () => {
  it('writes seen and history once across 5 re-renders with new-but-equal results', async () => {
    const base = ledgerRun('N02').evaluation.result;
    const w = writes();
    const { rerender } = await renderHook(({ result, ws }: { result: Result; ws: AnswerEffectWrites }) => useAnswerEffects({ row: { ...ROW }, result, writes: ws }), {
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
    const { rerender } = await renderHook(({ result }: { result: Result }) => useAnswerEffects({ row: ROW, result, writes: w }), { initialProps: { result: first } });
    await rerender({ result: copy(second) });
    await rerender({ result: copy(second) });
    await rerender({ result: copy(second) });
    expect(w.markSeen).toHaveBeenCalledTimes(2);
    expect(w.recordHistory).toHaveBeenCalledTimes(2);
    expect(w.recordHistory.mock.calls[1]![0].result.code).toBe(second.code);
  });

  it('nothing is written while the result is loading', async () => {
    const w = writes();
    await renderHook(() => useAnswerEffects({ row: ROW, result: null, writes: w }));
    expect(w.markSeen).not.toHaveBeenCalled();
    expect(w.recordHistory).not.toHaveBeenCalled();
  });
});
