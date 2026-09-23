/**
 * The four user-selectable accent colours (BUILD-PROMPT.md §2). Keys match the
 * `profiles.accent` check constraint in supabase/migrations/20260922000100_household_of_one.sql
 * ('green' | 'navy' | 'rust' | 'slate').
 */
export const ACCENTS = {
  green: '#1B4D3E',
  navy: '#1F3A5F',
  rust: '#7A4B2A',
  slate: '#3E5C6B',
} as const;

export type AccentKey = keyof typeof ACCENTS;

export const DEFAULT_ACCENT: AccentKey = 'green';

export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];
