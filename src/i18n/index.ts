import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from './locales/en';

// DSG-04: the whole typed catalogue. Add a new locale here (and to SUPPORTED_LOCALES)
// once a second language ships — Phase 0 only ships English.
const SUPPORTED_LOCALES = ['en'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(code: string | null | undefined): code is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(code ?? '');
}

function resolveInitialLng(): SupportedLocale {
  const deviceLanguageCode = getLocales()[0]?.languageCode;
  return isSupportedLocale(deviceLanguageCode) ? deviceLanguageCode : 'en';
}

// Initialised synchronously (initAsync: false — the i18next 26 replacement for the older
// `initImmediate` option) so the first render already has strings: resources are passed
// directly, not loaded from a backend, so there is nothing to actually wait on.
void i18next.use(initReactI18next).init({
  resources: { en: { common: en } },
  lng: resolveInitialLng(),
  fallbackLng: 'en',
  defaultNS: 'common',
  keySeparator: '.',
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

export { i18next as i18n };

export const useT = () => useTranslation().t;
