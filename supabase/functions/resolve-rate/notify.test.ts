import { notifyOperator, EMAIL_MIN_INTERVAL_MINUTES, type NotifyDeps } from './notify';
import { buildDigest, type UnsentAlert } from '../_shared/fx/digest';

const NOW = new Date('2026-10-07T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

const alerts: UnsentAlert[] = [
  { id: 1, kind: 'sync-failed', quote: null, detail: { via: 'resolve-rate', date: '2026-10-07', quotes: ['GBP'] }, created_at: minutesAgo(5) },
  { id: 2, kind: 'held', quote: 'JPY', detail: { heldRate: '200' }, created_at: minutesAgo(4) },
];

function makeDeps(overrides: Partial<NotifyDeps> = {}): NotifyDeps {
  return {
    now: jest.fn(() => NOW),
    lastEmailedAt: jest.fn(async () => minutesAgo(61)),
    unsentAlerts: jest.fn(async () => alerts),
    markEmailed: jest.fn(async () => undefined),
    sendEmail: jest.fn(async () => undefined),
    configured: jest.fn(() => true),
    ...overrides,
  };
}

describe('notifyOperator', () => {
  it('does nothing beyond configured() when the Resend secrets are missing', async () => {
    const deps = makeDeps({ configured: jest.fn(() => false) });
    expect(await notifyOperator(deps)).toEqual({ emailed: 0 });
    expect(deps.lastEmailedAt).not.toHaveBeenCalled();
    expect(deps.unsentAlerts).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it(`sends nothing when the last email was inside ${EMAIL_MIN_INTERVAL_MINUTES} minutes`, async () => {
    const deps = makeDeps({ lastEmailedAt: jest.fn(async () => minutesAgo(59)) });
    expect(await notifyOperator(deps)).toEqual({ emailed: 0 });
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it('sends no heartbeat when there are no unsent alerts', async () => {
    const deps = makeDeps({ unsentAlerts: jest.fn(async () => []) });
    expect(await notifyOperator(deps)).toEqual({ emailed: 0 });
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it('emails one digest for 2 unsent alerts and marks them emailed', async () => {
    const deps = makeDeps();
    expect(await notifyOperator(deps)).toEqual({ emailed: 2 });
    const { subject, text } = buildDigest(alerts);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    expect(deps.sendEmail).toHaveBeenCalledWith(subject, text);
    expect(deps.markEmailed).toHaveBeenCalledWith([1, 2]);
  });

  it('emails when no email has ever been sent', async () => {
    const deps = makeDeps({ lastEmailedAt: jest.fn(async () => null) });
    expect(await notifyOperator(deps)).toEqual({ emailed: 2 });
  });

  it('does not mark alerts emailed and does not throw when sendEmail throws', async () => {
    const deps = makeDeps({ sendEmail: jest.fn(async () => { throw new Error('resend 500'); }) });
    expect(await notifyOperator(deps)).toEqual({ emailed: 0 });
    expect(deps.markEmailed).not.toHaveBeenCalled();
  });

  it('does not throw when a read throws', async () => {
    expect(await notifyOperator(makeDeps({ lastEmailedAt: jest.fn(async () => { throw new Error('db'); }) }))).toEqual({ emailed: 0 });
    expect(await notifyOperator(makeDeps({ unsentAlerts: jest.fn(async () => { throw new Error('db'); }) }))).toEqual({ emailed: 0 });
  });
});
