// Runs under Deno (`npm run test:deno`) and under Jest (the default suite): no runner imports.
import { inQuietHours, isDigestWindow, localParts, quietEndsAt } from './schedule.ts';

type Runner = (name: string, fn: () => void | Promise<void>) => void;
const g = globalThis as unknown as { Deno?: { test: Runner }; test?: Runner };
const run: Runner = (name, fn) => (g.Deno ? g.Deno.test(name, fn) : (g.test as Runner)(name, fn));

function assertEquals(actual: unknown, expected: unknown, msg = ''): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

const VAN = 'America/Vancouver';
// 2026-11-21 local Vancouver (PST, UTC-8)
const at = (h: number, m: number) => new Date(Date.UTC(2026, 10, 21, h + 8, m));

run('localParts reads the person own date and minutes', () => {
  assertEquals(localParts(new Date('2026-11-22T06:30:00Z'), VAN), { date: '2026-11-21', minutes: 22 * 60 + 30 });
});

run('inQuietHours wraps midnight', () => {
  assertEquals(inQuietHours(at(23, 10), VAN, true, '22:00', '07:00'), true);
  assertEquals(inQuietHours(at(6, 59), VAN, true, '22:00:00', '07:00:00'), true);
  assertEquals(inQuietHours(at(7, 0), VAN, true, '22:00', '07:00'), false);
  assertEquals(inQuietHours(at(21, 59), VAN, true, '22:00', '07:00'), false);
});

run('inQuietHours off or empty window is never quiet', () => {
  assertEquals(inQuietHours(at(23, 10), VAN, false, '22:00', '07:00'), false);
  assertEquals(inQuietHours(at(23, 10), VAN, true, '22:00', '22:00'), false);
});

run('inQuietHours non-wrapping window', () => {
  assertEquals(inQuietHours(at(13, 0), VAN, true, '12:00', '14:00'), true);
  assertEquals(inQuietHours(at(14, 0), VAN, true, '12:00', '14:00'), false);
});

run('quietEndsAt is 07:00 local the next morning', () => {
  assertEquals(quietEndsAt(at(23, 10), VAN, '07:00').toISOString(), '2026-11-22T15:00:00.000Z');
});

run('quietEndsAt after midnight is the same morning', () => {
  assertEquals(quietEndsAt(at(3, 0), VAN, '07:00').toISOString(), '2026-11-21T15:00:00.000Z');
});

run('quietEndsAt across the autumn DST change stays at 07:00 local', () => {
  // 2026-10-31 23:10 PDT (UTC-7) = 2026-11-01T06:10Z; 07:00 on Nov 1 is PST (UTC-8) = 15:00Z.
  assertEquals(quietEndsAt(new Date('2026-11-01T06:10:00Z'), VAN, '07:00').toISOString(), '2026-11-01T15:00:00.000Z');
});

run('quietEndsAt across the spring DST change stays at 07:00 local', () => {
  // 2027-03-13 23:10 PST = 2027-03-14T07:10Z; 07:00 on Mar 14 is PDT (UTC-7) = 14:00Z.
  assertEquals(quietEndsAt(new Date('2027-03-14T07:10:00Z'), VAN, '07:00').toISOString(), '2027-03-14T14:00:00.000Z');
});

run('quietEndsAt in a zone ahead of UTC', () => {
  // Sydney 2026-11-22 23:30 AEDT (UTC+11) = 12:30Z; 07:00 next day = 2026-11-22T20:00Z.
  assertEquals(quietEndsAt(new Date('2026-11-22T12:30:00Z'), 'Australia/Sydney', '07:00').toISOString(), '2026-11-22T20:00:00.000Z');
});

run('isDigestWindow only at 08:00-08:14 and once a day', () => {
  assertEquals(isDigestWindow(at(8, 0), VAN, null), true);
  assertEquals(isDigestWindow(at(8, 14), VAN, '2026-11-20'), true);
  assertEquals(isDigestWindow(at(8, 15), VAN, '2026-11-20'), false);
  assertEquals(isDigestWindow(at(7, 59), VAN, '2026-11-20'), false);
  assertEquals(isDigestWindow(at(8, 5), VAN, '2026-11-21'), false);
});
