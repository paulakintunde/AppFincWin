import { fcRuns } from './fcRuns';

describe('fcRuns', () => {
  const saved = { FC_RUNS: process.env.FC_RUNS, S: process.env.STRYKER_MUTATOR_RUNNER };
  const restore = (k: string, v: string | undefined) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  afterEach(() => {
    restore('FC_RUNS', saved.FC_RUNS);
    restore('STRYKER_MUTATOR_RUNNER', saved.S);
  });

  it('returns the default when nothing is set', () => {
    delete process.env.FC_RUNS;
    delete process.env.STRYKER_MUTATOR_RUNNER;
    expect(fcRuns(200)).toBe(200);
  });

  it('caps at 10 under Stryker', () => {
    delete process.env.FC_RUNS;
    process.env.STRYKER_MUTATOR_RUNNER = 'jest';
    expect(fcRuns(200)).toBe(10);
    expect(fcRuns(5)).toBe(5);
  });

  it('FC_RUNS wins when positive', () => {
    process.env.FC_RUNS = '1000';
    process.env.STRYKER_MUTATOR_RUNNER = 'jest';
    expect(fcRuns(200)).toBe(1000);
  });

  it('ignores a non-positive FC_RUNS', () => {
    process.env.FC_RUNS = '0';
    delete process.env.STRYKER_MUTATOR_RUNNER;
    expect(fcRuns(200)).toBe(200);
  });
});
