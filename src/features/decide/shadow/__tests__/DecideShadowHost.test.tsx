// 05.4-36 BO-08: the quiet host renders nothing, runs only for testers, once per mount, and again when back online.
import { onlineManager } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import React from 'react';
import * as decideV3Queries from '@/data/queries/decideV3';
import * as profileModule from '@/features/you/useProfile';
import * as idle from '../../check/scheduleIdle';
import * as runner from '../runShadow';
import { DecideShadowHost } from '../DecideShadowHost';
import * as availability from '../../availability';

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: jest.fn() }));
jest.mock('@/features/you/useProfile', () => ({ useProfile: jest.fn() }));

const inputs = { asOf: '2026-10-10', currency: 'USD' } as never;

function setProfile(decide_shadow: boolean | undefined): void {
  jest.mocked(profileModule.useProfile).mockReturnValue({ profile: { id: 'u1', decide_shadow } } as never);
}

function setDecide(status: 'loading' | 'ready'): jest.MockedFunction<typeof decideV3Queries.useDecideV3> {
  const m = jest.mocked(decideV3Queries.useDecideV3);
  m.mockClear();
  m.mockReturnValue({ status, inputs: status === 'ready' ? inputs : null } as never);
  return m;
}

beforeEach(() => {
  jest.spyOn(idle, 'scheduleIdle').mockImplementation((task) => {
    task();
    return () => undefined;
  });
  onlineManager.setOnline(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DecideShadowHost', () => {
  it.each([false, undefined])('decide_shadow %p: renders nothing, never reads Decide, never runs', async (flag) => {
    setProfile(flag);
    const decide = setDecide('ready');
    const run = jest.spyOn(runner, 'runShadow');
    const view = await render(<DecideShadowHost />);
    expect(view.toJSON()).toBeNull();
    expect(decide).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('no profile yet: nothing', async () => {
    jest.mocked(profileModule.useProfile).mockReturnValue({ profile: null } as never);
    const run = jest.spyOn(runner, 'runShadow');
    await render(<DecideShadowHost />);
    expect(run).not.toHaveBeenCalled();
  });

  it('a tester: waits for the Decide inputs, then runs once with them and renders nothing', async () => {
    setProfile(true);
    const decide = setDecide('loading');
    const run = jest.spyOn(runner, 'runShadow').mockResolvedValue('sent');
    const view = await render(<DecideShadowHost />);
    expect(run).not.toHaveBeenCalled();
    decide.mockReturnValue({ status: 'ready', inputs } as never);
    await view.rerender(<DecideShadowHost />);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toMatchObject({ enabled: true, userId: 'u1', inputs });
    await view.rerender(<DecideShadowHost />);
    expect(run).toHaveBeenCalledTimes(1);
    expect(view.toJSON()).toBeNull();
  });

  it('offline: waits, and runs when the phone comes back online', async () => {
    setProfile(true);
    setDecide('ready');
    onlineManager.setOnline(false);
    const run = jest.spyOn(runner, 'runShadow').mockResolvedValue('sent');
    await render(<DecideShadowHost />);
    expect(run).not.toHaveBeenCalled();
    await act(async () => onlineManager.setOnline(true));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('an offline outcome lets the next online change run it again', async () => {
    setProfile(true);
    setDecide('ready');
    const run = jest.spyOn(runner, 'runShadow').mockResolvedValue('offline');
    await render(<DecideShadowHost />);
    await act(async () => undefined);
    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => onlineManager.setOnline(false));
    await act(async () => onlineManager.setOnline(true));
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('reports through the fixed reporter without amounts', async () => {
    setProfile(true);
    setDecide('ready');
    const errors = jest.requireActual<typeof import('@/services/errors/errorReporter')>('@/services/errors/errorReporter');
    const failedWrite = jest.spyOn(errors, 'captureFailedWrite').mockImplementation(() => undefined);
    const failed = jest.spyOn(errors, 'captureError').mockImplementation(() => undefined);
    const run = jest.spyOn(runner, 'runShadow').mockImplementation(async (deps) => {
      deps.report.failedWrite('23514');
      deps.report.failed();
      return 'failed';
    });
    await render(<DecideShadowHost />);
    await act(async () => undefined);
    expect(run).toHaveBeenCalledTimes(1);
    expect(failedWrite).toHaveBeenCalledWith({ entity: 'decide_shadow_runs', kind: 'insert', code: '23514' });
    expect(failed).toHaveBeenCalledWith(new Error('decide shadow run failed'), { area: 'sync' });
  });

  it('Decide stays off', () => {
    expect(availability.DECIDE_OPEN).toBe(false);
    expect(availability.DECIDE_V3).toBe(false);
  });
});
