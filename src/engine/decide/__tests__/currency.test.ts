import { currencyCode } from '../../money/types';
import { assertCurrency } from '../currency';
import { USD } from './helpers/fixtures';

describe('assertCurrency', () => {
  it('accepts a matching currency', () => {
    expect(() => assertCurrency(USD, USD, 'line l1', 'prepareContext')).not.toThrow();
  });

  it('rejects a mismatch with a RangeError naming both codes and the place', () => {
    const run = () => assertCurrency(USD, currencyCode('CAD'), 'line l1', 'prepareContext');
    expect(run).toThrow(RangeError);
    expect(run).toThrow(/^prepareContext: mixed currencies/);
    expect(run).toThrow(/line l1/);
    expect(run).toThrow(/CAD/);
    expect(run).toThrow(/USD/);
  });
});
