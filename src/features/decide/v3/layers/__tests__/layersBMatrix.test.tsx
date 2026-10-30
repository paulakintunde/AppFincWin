/** Plan 05.3-42: the value, major asset and very large cards fit the R6 checks at 320 / 402 dp and text scale 1.0 / 2.0. */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react-native';
import { MATRIX, expectFits, matrixName } from '../../../__tests__/helpers/r18Fit';
import { emptyCheck, withItemType, withLayerAnswer } from '../../model/checkEdits';
import { MajorAssetCard } from '../MajorAssetCard';
import { ValueCard } from '../ValueCard';
import { VeryLargeCard } from '../VeryLargeCard';
import { Stateful } from './harness';

jest.setTimeout(60000);

let mockWidth = 402;
let mockScale = 1;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));

describe('value, major asset and very large cards fit the R6 checks', () => {
  for (const m of MATRIX) {
    it(`at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      let initial = withItemType(emptyCheck(), { kind: 'preset', value: 'vehicle' });
      initial = withLayerAnswer(initial, 'L7.sources', [{ source: 'Savings and a long name for a second source', amount: 500000 }, { source: '', amount: null }]);
      initial = withLayerAnswer(initial, 'L7.stages', [{ date: '2027-02-01', amount: 900000 }]);
      await render(
        <Stateful initial={initial} scale={m.scale}>
          {({ check, edit }) => (
            <>
              <ValueCard check={check} edit={edit} currency="USD" />
              <MajorAssetCard check={check} edit={edit} currency="USD" />
              <VeryLargeCard check={check} edit={edit} currency="USD" stagedRequired />
            </>
          )}
        </Stateful>,
      );
      expect(screen.getByTestId('value-card')).toBeTruthy();
      expect(screen.getByTestId('major-asset-card')).toBeTruthy();
      expect(screen.getByTestId('very-large-card')).toBeTruthy();
      expect(screen.getByTestId('source-row-1')).toBeTruthy();
      expectFits({ clampCount: 0 });
      await cleanup();
    });
  }
});
