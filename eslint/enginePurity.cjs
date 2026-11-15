// ENG-16 (05.5): the engine is pure. No clock, randomness or locale inside src/engine production code.
// Registered in eslint.config.js by plan 05.5-07. Proven by src/test/lint/enginePurity.test.ts.
const MSG = 'engine/ is pure: no clock, randomness or locale (05.5 ENG-16). Take the date or locale as an input.';

const DATE_RULES = [
  { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: MSG },
  { selector: "CallExpression[callee.name='Date']", message: MSG },
];

// The only files that may use Intl (formatting and parsing).
const INTL_FILES = [
  'src/engine/money/formatAmount.ts',
  'src/engine/money/formatDate.ts',
  'src/engine/money/parseAmount.ts',
  'src/engine/paste/parseLines.ts',
  'src/engine/time/localDate.ts',
];

module.exports = [
  {
    files: ['src/engine/**/*.ts'],
    ignores: ['src/engine/**/__tests__/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: MSG },
        { object: 'Math', property: 'random', message: MSG },
        { object: 'performance', property: 'now', message: MSG },
        { property: 'toLocaleString', message: MSG },
        { property: 'toLocaleDateString', message: MSG },
        { property: 'toLocaleTimeString', message: MSG },
      ],
      'no-restricted-syntax': [
        'error',
        ...DATE_RULES,
        {
          selector: "MemberExpression[object.name='Intl']",
          message: MSG + ' Intl is allowed only in the five named formatting files.',
        },
      ],
    },
  },
  {
    files: INTL_FILES,
    rules: { 'no-restricted-syntax': ['error', ...DATE_RULES] },
  },
];
