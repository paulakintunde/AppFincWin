import { monthDataState, type QueryPart } from '../monthDataState';

const ok: QueryPart = { data: [], isError: false, fetchStatus: 'idle' };
const fetching: QueryPart = { data: undefined, isError: false, fetchStatus: 'fetching' };
const paused: QueryPart = { data: undefined, isError: false, fetchStatus: 'paused' };
const failed: QueryPart = { data: undefined, isError: true, fetchStatus: 'idle' };

describe('monthDataState', () => {
  it('is ready when tx and series have data, even if a refetch errored', () => {
    expect(monthDataState({ tx: ok, series: ok, fx: ok })).toBe('ready');
    expect(monthDataState({ tx: { ...ok, isError: true }, series: ok, fx: ok })).toBe('ready');
  });
  it('is error when tx or series failed with no data', () => {
    expect(monthDataState({ tx: failed, series: ok, fx: ok })).toBe('error');
    expect(monthDataState({ tx: ok, series: failed, fx: ok })).toBe('error');
  });
  it('is offline when paused with no data', () => {
    expect(monthDataState({ tx: paused, series: ok, fx: ok })).toBe('offline');
  });
  it('is loading while fetching, or idle with no data', () => {
    expect(monthDataState({ tx: fetching, series: ok, fx: ok })).toBe('loading');
    const idle: QueryPart = { data: undefined, isError: false, fetchStatus: 'idle' };
    expect(monthDataState({ tx: idle, series: idle, fx: ok })).toBe('loading');
  });
  it('is loading while fx fetches, ready when fx paused or failed', () => {
    expect(monthDataState({ tx: ok, series: ok, fx: fetching })).toBe('loading');
    expect(monthDataState({ tx: ok, series: ok, fx: paused })).toBe('ready');
    expect(monthDataState({ tx: ok, series: ok, fx: failed })).toBe('ready');
  });
});
