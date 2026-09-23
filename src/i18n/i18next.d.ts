import 'i18next';
import type en from './locales/en';

// DSG-04: augments i18next's TypeOptions so t() only accepts real leaf keys from the
// English catalogue and rejects unknown/non-leaf keys at compile time.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof en;
    };
    returnNull: false;
  }
}
