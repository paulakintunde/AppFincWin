'use strict';
// 05.5-03 (D-14): ESLint 9 rule 'copy-guard'. Runs the per-sentence guard over string values in a locale catalogue.
// Registered for src/i18n/locales in plan 05.5-07, after 06.1 merges.
const fs = require('fs');
const path = require('path');
const guard = require('./guard.cjs');

function keyName(property) {
  const k = property.key;
  if (!k) return null;
  if (k.type === 'Identifier' && !property.computed) return k.name;
  if (k.type === 'Literal') return String(k.value);
  return null;
}

/** Dotted path from the root object of the default export down to this property, or null when not resolvable. */
function pathOf(property) {
  const parts = [];
  let node = property;
  while (node && node.type === 'Property') {
    const name = keyName(node);
    if (name === null) return null;
    parts.unshift(name);
    const obj = node.parent;
    if (!obj || obj.type !== 'ObjectExpression') return null;
    node = obj.parent;
  }
  return parts.join('.');
}

function stringOf(value) {
  if (value.type === 'Literal' && typeof value.value === 'string') return value.value;
  if (value.type === 'TemplateLiteral' && value.expressions.length === 0) return value.quasis.map((q) => q.value.cooked).join('');
  return null;
}

module.exports = {
  meta: {
    type: 'problem',
    schema: [{ type: 'object', properties: { allowlist: { type: 'string' } }, additionalProperties: false }],
    messages: {
      copy: '{{rule}} in "{{sentence}}" at {{path}} (05.5 copy guard; rewrite through owner wording sign-off or add a dated allowlist entry)',
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const allowlistPath = options.allowlist ? path.resolve(options.allowlist) : require.resolve('./allowlist.json');
    const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
    return {
      Property(node) {
        const text = stringOf(node.value);
        if (text === null) return;
        const dotted = pathOf(node);
        if (dotted === null) return;
        for (const v of guard.checkString(dotted, text)) {
          if (guard.isAllowed(v, allowlist)) continue;
          context.report({ node: node.value, messageId: 'copy', data: { rule: v.rule, sentence: v.sentence, path: v.path } });
        }
      },
    };
  },
};
