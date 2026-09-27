/**
 * OFX element-tree builder (D-39; RESEARCH §A1 step 3), following ofxtools'
 * reference rule: a start tag immediately followed by text is a leaf and is
 * closed implicitly, whether or not an end tag actually follows; anything
 * else after an `open` is an aggregate and must be closed explicitly. A
 * stray close becomes a warning, never a thrown error, and an aggregate
 * still open at EOF is closed implicitly with a warning -- real bank files
 * routinely do both.
 *
 * The whole build is one iterative pass with an explicit stack: there is no
 * recursion anywhere in this module, so a maliciously deep file cannot
 * overflow the JS call stack even before the depth budget below rejects it.
 */
import { OFX_LIMITS, type OfxToken } from './tokenize';

export interface OfxNode {
  name: string;
  value: string | null; // set only on leaves
  children: OfxNode[];
}

export type TreeWarning = 'malformed-close' | 'unclosed-aggregate';

export type BuildOfxTreeResult =
  | { ok: true; root: OfxNode; warnings: TreeWarning[] }
  | { ok: false; error: 'too-large' | 'too-deep' };

const ROOT_NAME = '#root';

/**
 * Builds an `OfxNode` tree from a token stream (RESEARCH §A1 step 3, budget
 * step 4). `tokens` is normally `tokenizeOfx(...).tokens`, but this function
 * takes the token array directly so a test (or a future streaming tokenizer)
 * can feed it without re-tokenizing.
 */
export function buildOfxTree(tokens: readonly OfxToken[]): BuildOfxTreeResult {
  const root: OfxNode = { name: ROOT_NAME, value: null, children: [] };
  const stack: OfxNode[] = [root];
  const warnings = new Set<TreeWarning>();
  let elementCount = 0;

  const len = tokens.length;
  let i = 0;
  while (i < len) {
    const tok = tokens[i] as OfxToken;

    if (tok.t === 'text') {
      // Stray text with no open element to attach to (e.g. text directly
      // under the root, which OFX never has, or text left over after a
      // close). It has nowhere to live and is simply dropped.
      i += 1;
      continue;
    }

    if (tok.t === 'close') {
      let matchIndex = -1;
      for (let s = stack.length - 1; s >= 1; s -= 1) {
        if ((stack[s] as OfxNode).name === tok.name) {
          matchIndex = s;
          break;
        }
      }

      if (matchIndex === -1) {
        warnings.add('malformed-close');
        i += 1;
        continue;
      }

      while (stack.length - 1 > matchIndex) {
        stack.pop();
        warnings.add('unclosed-aggregate');
      }
      stack.pop();
      i += 1;
      continue;
    }

    // tok.t === 'open'
    const parent = stack[stack.length - 1] as OfxNode;
    const next = tokens[i + 1];

    if (next !== undefined && next.t === 'text') {
      elementCount += 1;
      if (elementCount > OFX_LIMITS.maxElements) return { ok: false, error: 'too-large' };

      const leaf: OfxNode = { name: tok.name, value: next.value, children: [] };
      parent.children.push(leaf);
      i += 2;

      const after = tokens[i];
      if (after !== undefined && after.t === 'close' && after.name === tok.name) {
        i += 1;
      }
      continue;
    }

    elementCount += 1;
    if (elementCount > OFX_LIMITS.maxElements) return { ok: false, error: 'too-large' };

    const aggregate: OfxNode = { name: tok.name, value: null, children: [] };
    parent.children.push(aggregate);
    stack.push(aggregate);
    if (stack.length - 1 > OFX_LIMITS.maxDepth) return { ok: false, error: 'too-deep' };
    i += 1;
  }

  while (stack.length > 1) {
    stack.pop();
    warnings.add('unclosed-aggregate');
  }

  return { ok: true, root, warnings: Array.from(warnings) };
}

/** Iterative pre-order DFS (no recursion) for every descendant named `name`, in document order. */
export function findAll(root: OfxNode, name: string): OfxNode[] {
  const result: OfxNode[] = [];
  const stack: OfxNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop() as OfxNode;
    if (node.name === name) result.push(node);
    for (let c = node.children.length - 1; c >= 0; c -= 1) {
      stack.push(node.children[c] as OfxNode);
    }
  }

  return result;
}

/** The direct child element named `name`, or `null`. */
export function child(node: OfxNode, name: string): OfxNode | null {
  for (const c of node.children) {
    if (c.name === name) return c;
  }
  return null;
}

/** The direct child leaf's text value, or `null` (no such child, or it is not a leaf). */
export function childText(node: OfxNode, name: string): string | null {
  const found = child(node, name);
  return found === null ? null : found.value;
}
