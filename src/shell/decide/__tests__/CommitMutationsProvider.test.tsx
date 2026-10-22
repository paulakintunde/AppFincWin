import React from 'react';
import { act, render } from '@testing-library/react-native';
import * as goAheadModule from '@/data/mutations/decideGoAhead';
import * as outcomeModule from '@/data/mutations/decideOutcome';
import * as errorReporter from '@/services/errors/errorReporter';
import { useCommitMutations, type CommitMutations } from '@/features/decide/check/commitMutations';
import { CommitMutationsProvider, dryRunGoAhead } from '../CommitMutationsProvider';

const mockGo = jest.fn(() => 'step-1');
const mockPass = jest.fn();

beforeEach(() => {
  jest.restoreAllMocks();
  mockGo.mockClear();
  mockPass.mockClear();
  // The hooks hand back a new object on every render, as the real ones do.
  jest.spyOn(goAheadModule, 'useGoAhead').mockImplementation(() => ({ goAhead: mockGo }));
  jest.spyOn(outcomeModule, 'useWaitAndSave').mockImplementation(() => ({ save: jest.fn() }) as never);
  jest.spyOn(outcomeModule, 'usePass').mockImplementation(() => ({ pass: mockPass }) as never);
});

const args = {} as Parameters<CommitMutations['canWrite']>[0];

describe('CommitMutationsProvider (WR-D11)', () => {
  it('keeps one context value across re-renders and calls the latest hooks', async () => {
    const seen: CommitMutations[] = [];
    function Probe({ tick }: { tick: number }) {
      seen.push(useCommitMutations());
      void tick;
      return null;
    }
    const view = await render(
      <CommitMutationsProvider>
        <Probe tick={0} />
      </CommitMutationsProvider>
    );
    await view.rerender(
      <CommitMutationsProvider>
        <Probe tick={1} />
      </CommitMutationsProvider>
    );
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[seen.length - 1]).toBe(seen[0]);
    await act(async () => {
      expect(seen[0]!.goAhead({} as never)).toBe('step-1');
      seen[0]!.pass({} as never);
    });
    expect(mockGo).toHaveBeenCalledTimes(1);
    expect(mockPass).toHaveBeenCalledTimes(1);
  });

  it('a builder refusal answers false without a report', () => {
    const capture = jest.spyOn(errorReporter, 'captureError').mockImplementation(() => undefined);
    jest.spyOn(goAheadModule, 'buildGoAheadWrite').mockImplementation(() => {
      throw new TypeError('buildGoAheadWrite: cardAccountId is required');
    });
    jest.spyOn(goAheadModule, 'isGoAheadRefusal').mockReturnValue(true);
    expect(dryRunGoAhead(args)).toBe(false);
    expect(capture).not.toHaveBeenCalled();
  });

  it('any other error answers false and is reported, not hidden', () => {
    const capture = jest.spyOn(errorReporter, 'captureError').mockImplementation(() => undefined);
    const bug = new TypeError('cannot read properties of undefined');
    jest.spyOn(goAheadModule, 'buildGoAheadWrite').mockImplementation(() => {
      throw bug;
    });
    jest.spyOn(goAheadModule, 'isGoAheadRefusal').mockReturnValue(false);
    expect(dryRunGoAhead(args)).toBe(false);
    expect(capture).toHaveBeenCalledWith(bug, { area: 'ui' });
  });

  it('a build that succeeds answers true', () => {
    jest.spyOn(goAheadModule, 'buildGoAheadWrite').mockReturnValue({} as never);
    expect(dryRunGoAhead(args)).toBe(true);
  });
});
