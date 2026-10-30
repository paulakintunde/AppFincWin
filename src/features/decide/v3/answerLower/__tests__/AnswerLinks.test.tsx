/** Plan 05.3-38: the links under the facts. */
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/features/decide/v3/answer/__tests__/kit';
import { AnswerLinks } from '../AnswerLinks';

jest.setTimeout(60000);

const mockPushOnce = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPushOnce(h) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@/features/decide/v3/shared/useV3Format', () => ({ useV3Format: () => ({ money: (n: number) => '$' + n / 100 }) }));

beforeEach(() => jest.clearAllMocks());

describe('AnswerLinks', () => {
  it('band 2 needs_input: no instead row, the worked-out link stays', async () => {
    await wrap(<AnswerLinks checkId="c1" code="needs_input" band={2} wholePlanTotal={null} />);
    expect(screen.queryByText('What could I do instead?')).toBeNull();
    expect(screen.getByText('See how this was worked out')).toBeTruthy();
  });

  it('band 6 periodic: outlined accent instead row and the whole plan row', async () => {
    await wrap(<AnswerLinks checkId="c1" code="fits_month" band={6} wholePlanTotal={123400} />);
    const instead = StyleSheet.flatten(screen.getByLabelText('What could I do instead?').props.style);
    expect(instead.borderWidth).toBe(1.5);
    expect(instead.minHeight).toBe(54);
    await fireEvent.press(screen.getByLabelText('What could I do instead?'));
    expect(mockPushOnce).toHaveBeenCalledWith({ pathname: '/decide/instead/[id]', params: { id: 'c1' } });
    await fireEvent.press(screen.getByLabelText('The whole plan · $1234'));
    expect(mockPushOnce).toHaveBeenCalledWith({ pathname: '/decide/plan/[id]', params: { id: 'c1' } });
  });

  it('band 1 has no instead row; the worked link is ink and underlined, not accent', async () => {
    await wrap(<AnswerLinks checkId="c1" code="fits_month" band={1} wholePlanTotal={null} />);
    expect(screen.queryByText('What could I do instead?')).toBeNull();
    const text = StyleSheet.flatten(screen.getByText('See how this was worked out').props.style);
    expect(text.textDecorationLine).toBe('underline');
    expect(text.color).toBe('#14150F');
  });
});
