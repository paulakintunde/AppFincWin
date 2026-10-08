import { buildDigest, type UnsentAlert } from './digest';

describe('buildDigest', () => {
  it('groups alerts by kind with a count in the subject', () => {
    const alerts: UnsentAlert[] = [
      { id: 1, kind: 'stale', quote: 'ARS', detail: { ageDays: 6 }, created_at: '2026-09-29T00:00:00Z' },
      { id: 2, kind: 'stale', quote: 'TRY', detail: { ageDays: 5 }, created_at: '2026-09-29T00:00:00Z' },
      { id: 3, kind: 'held', quote: 'VEF', detail: { changeRatio: 0.5 }, created_at: '2026-09-29T00:00:00Z' },
      { id: 4, kind: 'auto-accepted', quote: 'NGN', detail: { heldRate: '1600' }, created_at: '2026-09-29T00:00:00Z' },
    ];

    const { subject, text } = buildDigest(alerts);

    expect(subject).toBe('FincWin FX: 2 stale, 1 held, 1 auto-accepted');
    expect(text).toContain('ARS');
    expect(text).toContain('TRY');
    expect(text).toContain('VEF');
    expect(text).toContain('NGN');
  });

  it('carries no user data -- only kind, quote and detail values reach the text', () => {
    const alerts: UnsentAlert[] = [
      { id: 1, kind: 'pending-rows', quote: null, detail: { count: 3 }, created_at: '2026-09-29T00:00:00Z' },
    ];
    const { text } = buildDigest(alerts);
    expect(text).toContain('pending-rows');
    expect(text).toContain('3');
  });
});
