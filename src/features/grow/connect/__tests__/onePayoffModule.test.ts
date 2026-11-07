// ENG-24: one payoff module. Outside src/engine/payoff, no .ts file defines payoff maths (by name) or runs its own month loop.
import * as fs from 'fs';
import * as path from 'path';

/** Case-sensitive lower-camel names that would hold payoff maths. Components (PayoffPlanCard) start upper-case and never match. */
export function isPayoffMathsName(name: string): boolean {
  return /^(amortis|payoff|simulateMinimum|strategy|fixedPayoff)[A-Z0-9_]?/.test(name);
}

const SRC = path.resolve(__dirname, '../../../..');
const OWN = ['engine/payoff/', 'engine/decide/']; // Decide's existing card checks are allow-listed by path

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') && !/\.test\.ts$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f: string): string => path.relative(SRC, f).split(path.sep).join('/');
const files = sourceFiles(SRC).filter((f) => !rel(f).startsWith('engine/payoff/'));

describe('ENG-24: one payoff module', () => {
  it('the name matcher', () => {
    expect(isPayoffMathsName('payoffSchedule')).toBe(true);
    expect(isPayoffMathsName('amortiseLoan')).toBe(true);
    expect(isPayoffMathsName('fixedPayoff')).toBe(true);
    expect(isPayoffMathsName('PayoffPlanCard')).toBe(false);
    expect(isPayoffMathsName('PayoffStrategyRow')).toBe(false);
  });

  it('the scan covers .ts files only', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.every((f) => f.endsWith('.ts'))).toBe(true);
    expect(files.map(rel)).not.toContain('features/grow/debts/PayoffPlanCard.tsx');
  });

  it('no file outside engine/payoff defines a payoff-maths function', () => {
    const defines = /(?:function\s+([A-Za-z0-9_]+)|const\s+([A-Za-z0-9_]+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*(?::[^=]+)?=>)/g;
    const offenders: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.matchAll(defines)) {
        const name = m[1] ?? m[2] ?? '';
        if (isPayoffMathsName(name)) offenders.push(`${rel(f)}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no file outside engine/payoff and engine/decide runs its own monthly interest loop', () => {
    const offenders = files
      .filter((f) => !OWN.some((p) => rel(f).startsWith(p)))
      .filter((f) => {
        const hits = fs.readFileSync(f, 'utf8').match(/divideHalfUp\([^)]*MONTHLY_RATE_DENOMINATOR/g);
        return (hits?.length ?? 0) > 1;
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
