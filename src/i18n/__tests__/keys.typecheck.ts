// DSG-04 compile-time check: not a jest test (excluded from testMatch and coverage —
// see jest.config.js), only checked via `tsc --noEmit`. Confirms t() accepts a real leaf
// key and rejects an unknown key and a non-leaf (object) key at compile time.
import { i18n } from '../index';

const t = i18n.t;

t('update.heading');

// @ts-expect-error unknown key
t('does.not.exist');

// @ts-expect-error non-leaf key ('you' is an object, not a string leaf)
t('you');
