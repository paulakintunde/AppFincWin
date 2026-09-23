import { useFonts } from 'expo-font';
import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
} from '@expo-google-fonts/archivo';
import { ArchivoBlack_400Regular } from '@expo-google-fonts/archivo-black';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';

/**
 * The four user-selectable font pairings (Component.FONTS, FincWin United.dc.html
 * lines 3359-3364). Keys match the `profiles.font_pairing` check constraint in
 * supabase/migrations/20260922000100_household_of_one.sql.
 */
export type FontPairingKey = 'bold' | 'modern' | 'grotesk' | 'neutral';

export type FontWeight = 400 | 500 | 600 | 700 | 800;

export interface FontPairing {
  label: 'Bold' | 'Modern' | 'Grotesk' | 'Neutral';
  display: string;
  body: Record<FontWeight, string>;
}

export const FONT_PAIRINGS: Record<FontPairingKey, FontPairing> = {
  bold: {
    label: 'Bold',
    display: 'ArchivoBlack_400Regular',
    body: {
      400: 'Archivo_400Regular',
      500: 'Archivo_500Medium',
      600: 'Archivo_600SemiBold',
      700: 'Archivo_700Bold',
      800: 'Archivo_800ExtraBold',
    },
  },
  modern: {
    label: 'Modern',
    display: 'Manrope_800ExtraBold',
    body: {
      400: 'Manrope_400Regular',
      500: 'Manrope_500Medium',
      600: 'Manrope_600SemiBold',
      700: 'Manrope_700Bold',
      800: 'Manrope_800ExtraBold',
    },
  },
  grotesk: {
    label: 'Grotesk',
    display: 'SpaceGrotesk_700Bold',
    body: {
      400: 'SpaceGrotesk_400Regular',
      500: 'SpaceGrotesk_500Medium',
      600: 'SpaceGrotesk_600SemiBold',
      700: 'SpaceGrotesk_700Bold',
      // Space Grotesk ships no 800 weight; 800 maps to its heaviest available (700).
      800: 'SpaceGrotesk_700Bold',
    },
  },
  neutral: {
    label: 'Neutral',
    display: 'IBMPlexSans_700Bold',
    body: {
      400: 'IBMPlexSans_400Regular',
      500: 'IBMPlexSans_500Medium',
      600: 'IBMPlexSans_600SemiBold',
      700: 'IBMPlexSans_700Bold',
      // IBM Plex Sans ships no 800 weight; 800 maps to its heaviest available (700).
      800: 'IBMPlexSans_700Bold',
    },
  },
};

/**
 * Claude's Discretion (00-CONTEXT.md): load every face of all four pairings at boot,
 * rather than lazily on switch, so a live accent/font-pairing change is instant with no
 * async gap and no reload (FND-06).
 */
export function useThemeFonts(): [loaded: boolean, error: Error | null] {
  const [loaded, error] = useFonts({
    ArchivoBlack_400Regular,
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
  });
  return [loaded, error ?? null];
}
