// Flat config (ESLint 9+/10, CommonJS — package.json has no "type": "module").
const expoConfig = require('eslint-config-expo/flat');
const boundaries = require('eslint-plugin-boundaries');
const i18next = require('eslint-plugin-i18next');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      '.expo/**',
      'coverage/**',
      'dist/**',
      'supabase/functions/**', // Deno runtime, typechecked/linted separately
      '*.config.js',
      '*.cjs',
      'scripts/**',
      // Design-prototype reference files at repo root, predate the Expo app and are
      // deliberately left untouched (00-02-SUMMARY.md) — not part of the shipped app.
      'ios-frame.jsx',
      'support.js',
      'doc-page.js',
      'screens/**',
    ],
  },
  ...expoConfig,
  {
    // FND-04: engine/ purity — editor-time boundary feedback (dependency-cruiser is the CI backstop).
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'engine', pattern: 'src/engine/**' },
        { type: 'data', pattern: ['src/db/**', 'src/data/**'] },
        { type: 'state', pattern: 'src/state/**' },
        { type: 'services', pattern: 'src/services/**' },
        { type: 'ui', pattern: 'src/ui/**' },
        { type: 'shell', pattern: 'src/shell/**' },
        { type: 'features', pattern: 'src/features/**' },
        { type: 'theme', pattern: 'src/theme/**' },
        { type: 'i18n', pattern: 'src/i18n/**' },
        { type: 'config', pattern: 'src/config/**' },
      ],
      'import/resolver': { typescript: { project: './tsconfig.json' } },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { element: { type: 'engine' } },
              disallow: [
                { to: { element: { types: ['data', 'state', 'services', 'ui', 'shell', 'features'] } } },
              ],
              message: 'engine/ is pure TypeScript: no db/data, state, services, ui or features imports (FND-04).',
            },
          ],
        },
      ],
    },
  },
  {
    // Belt-and-braces: engine may never import React/RN/Expo/Supabase or reach into app layers by relative path.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                'react-native',
                'react-native-*',
                'expo',
                'expo-*',
                '@expo/*',
                '@supabase/*',
                '@react-native-*/*',
                'posthog-*',
                '**/db/**',
                '**/data/**',
                '**/state/**',
                '**/services/**',
                '**/ui/**',
                '**/shell/**',
                '**/features/**',
                '@/db/*',
                '@/data/*',
                '@/state/*',
                '@/services/*',
                '@/ui/*',
                '@/shell/*',
                '@/features/*',
              ],
              message: 'engine/ is pure TypeScript: no React, no I/O, no app layers (FND-04).',
            },
          ],
        },
      ],
    },
  },
  {
    // QA-03 (05.4-09): the cross-check calculator shares no code with the engine. Only the table's types may be imported.
    // This replaces the engine block's rule for these files, so the React and app-layer bans are repeated here.
    files: [
      'src/engine/decide/v3/__tests__/crosscheck/plain.ts',
      'src/engine/decide/v3/__tests__/crosscheck/rules.ts',
      'src/engine/decide/v3/__tests__/crosscheck/fixtureArb.ts',
      'src/engine/decide/v3/__tests__/crosscheck/pendingRules.ts',
      'src/engine/decide/v3/__tests__/crosscheck/__gate_probe__.ts', // verify-gates probe
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/engine/**',
                '../../*',
                '../../../*',
                '../../../../*',
                '../../../../../*',
                '../rightAnswers/fixture',
                '../rightAnswers/loader',
                '../rightAnswers/pick',
                '../helpers/*',
                '@/*',
                'react',
                'react/*',
                'react-native',
                'react-native-*',
                'expo',
                'expo-*',
                '@supabase/*',
              ],
              message: 'QA-03: the calculator shares no code with the engine',
            },
          ],
        },
      ],
    },
  },
  {
    // DSG-04: JSX literal text must come from the i18n catalogue.
    files: ['app/**/*.tsx', 'src/features/**/*.tsx', 'src/ui/**/*.tsx', 'src/shell/**/*.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }],
    },
  },
  {
    // DSG-07 / D-19: all text goes through the scaled primitives so the OS text-size caps hold everywhere.
    files: ['app/**/*.tsx', 'src/**/*.tsx'],
    ignores: ['src/ui/Text.tsx', 'src/ui/TextInput.tsx', 'src/engine/**', '**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', { paths: [{ name: 'react-native', importNames: ['Text', 'TextInput'], message: "DSG-07: import { Text } from '@/ui/Text' / { TextInput } from '@/ui/TextInput' so OS text scaling is capped (D-19)." }] }],
    },
  },
];
