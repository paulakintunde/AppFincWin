/**
 * OFX/QFX statement extraction (D-39, D-45; RESEARCH §A1 steps 5-6). Turns
 * the 02-33 element tree into `StatementDraft`s: one per `STMTRS`/`CCSTMTRS`
 * a file contains, in document order, so a multi-account file lets the user
 * pick which statement is the import target (D-12). Investment and loan
 * statements are a typed `unsupported-statement` result, never a crash.
 *
 * `ACCTID`, `BANKID` and `BRANCHID` are never read here -- they are account
 * numbers, and neither the layout signature nor any row needs them (D-42,
 * RESEARCH Security extension). No function in this module throws or logs
 * file content; every failure is a typed enum code.
 */
import { parseOfxAmount } from './amount';
import { ofxLocalDate } from './date';
import { buildOfxTree, child, childText, findAll, type OfxNode } from './tree';
import { splitOfxHeader, tokenizeOfx } from './tokenize';
import {
  MAX_DESCRIPTION,
  MAX_EXTERNAL_ID,
  MAX_RAW_CELL,
  type DraftRow,
  type DraftWarning,
  type StatedBalance,
  type StatementDraft,
} from '../statement/types';

export type ParseOfxError =
  | 'no-ofx-root'
  | 'too-large'
  | 'too-deep'
  | 'unsupported-statement'
  | 'no-statements';

export type ParseOfxResult = { ok: true; drafts: StatementDraft[] } | { ok: false; error: ParseOfxError };

export interface ParseOfxOptions {
  exponentFor(code: string): number | null;
}

interface FoundStatement {
  node: OfxNode;
  kind: 'bank' | 'card';
}

/**
 * One iterative document-order walk (mirrors `findAll`'s own traversal)
 * collecting every `STMTRS`/`CCSTMTRS` node in the order they appear, so a
 * file mixing both kinds is never re-ordered by extracting them separately.
 */
function collectStatements(root: OfxNode): FoundStatement[] {
  const found: FoundStatement[] = [];
  const stack: OfxNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop() as OfxNode;
    if (node.name === 'STMTRS') found.push({ node, kind: 'bank' });
    else if (node.name === 'CCSTMTRS') found.push({ node, kind: 'card' });
    for (let c = node.children.length - 1; c >= 0; c -= 1) {
      stack.push(node.children[c] as OfxNode);
    }
  }

  return found;
}

function collapseWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

function buildDescription(nameText: string | null, payeeNameText: string | null, memoText: string | null): string {
  const name = collapseWhitespace(nameText ?? payeeNameText ?? '');
  const memo = collapseWhitespace(memoText ?? '');

  let description: string;
  if (memo === '') {
    description = name;
  } else if (name === '') {
    description = memo;
  } else if (name.includes(memo)) {
    description = name;
  } else {
    description = `${name} · ${memo}`;
  }

  return description.slice(0, MAX_DESCRIPTION);
}

function readStatedBalance(
  statementNode: OfxNode,
  tagName: string,
  exponent: number
): StatedBalance | null {
  const balNode = child(statementNode, tagName);
  if (balNode === null) return null;

  const balAmtText = childText(balNode, 'BALAMT');
  if (balAmtText === null) return null;

  const amountResult = parseOfxAmount(balAmtText, exponent);
  if (!amountResult.ok) return null;

  const dtAsOfText = childText(balNode, 'DTASOF');
  return {
    magnitude: amountResult.magnitude,
    marker: amountResult.marker,
    asOf: dtAsOfText !== null ? ofxLocalDate(dtAsOfText) : null,
    raw: balAmtText.trim().slice(0, MAX_RAW_CELL),
  };
}

function layoutSignatureFor(statementNode: OfxNode, kind: 'bank' | 'card'): string {
  if (kind === 'card') return 'ofx|card';

  const bankAcctFrom = child(statementNode, 'BANKACCTFROM');
  const acctType = bankAcctFrom !== null ? childText(bankAcctFrom, 'ACCTTYPE') : null;
  return acctType !== null ? `ofx|bank|${acctType}` : 'ofx|bank';
}

function extractRow(stmttrn: OfxNode, index: number, currency: string, exponent: number, unknownCurrency: boolean): DraftRow {
  const issues: DraftRow['issues'] = [];

  const dtPostedText = childText(stmttrn, 'DTPOSTED');
  const localDate = dtPostedText !== null ? ofxLocalDate(dtPostedText) : null;
  if (localDate === null) issues.push('bad-date');

  const trnAmtText = childText(stmttrn, 'TRNAMT');
  const rawAmount = trnAmtText !== null ? trnAmtText.trim().slice(0, MAX_RAW_CELL) : null;

  let magnitude: DraftRow['magnitude'] = null;
  let marker: DraftRow['marker'] = 'none';
  if (trnAmtText === null) {
    issues.push('bad-amount');
  } else {
    const amountResult = parseOfxAmount(trnAmtText, exponent);
    if (!amountResult.ok) {
      issues.push(amountResult.error === 'too-large' ? 'amount-too-large' : 'bad-amount');
    } else {
      magnitude = amountResult.magnitude;
      marker = amountResult.marker;
      if (magnitude === 0) issues.push('zero-amount');
    }
  }

  if (unknownCurrency) issues.push('unknown-currency');

  const nameText = childText(stmttrn, 'NAME');
  const payeeNode = child(stmttrn, 'PAYEE');
  const payeeNameText = payeeNode !== null ? childText(payeeNode, 'NAME') : null;
  const memoText = childText(stmttrn, 'MEMO');
  const description = buildDescription(nameText, payeeNameText, memoText);
  if (description === '') issues.push('empty-description');

  const fitidText = childText(stmttrn, 'FITID');
  const trnTypeText = childText(stmttrn, 'TRNTYPE');

  return {
    index,
    localDate,
    description,
    magnitude,
    marker,
    rawAmount,
    balanceMagnitude: null,
    balanceMarker: 'none',
    rawBalance: null,
    currency,
    externalId: fitidText !== null ? fitidText.slice(0, MAX_EXTERNAL_ID) : null,
    trnType: trnTypeText !== null ? trnTypeText.toUpperCase() : null,
    issues,
  };
}

function extractDraft(
  statementNode: OfxNode,
  kind: 'bank' | 'card',
  opts: ParseOfxOptions,
  treeWarnings: DraftWarning[]
): StatementDraft {
  const curDefText = childText(statementNode, 'CURDEF');
  const currency = curDefText !== null ? curDefText.toUpperCase() : null;
  const exponentResult = currency !== null ? opts.exponentFor(currency) : null;
  const unknownCurrency = exponentResult === null;
  const exponent = exponentResult ?? 2;
  const rowCurrency = currency ?? '';

  const bankTranList = child(statementNode, 'BANKTRANLIST');
  const dtStartText = bankTranList !== null ? childText(bankTranList, 'DTSTART') : null;
  const dtEndText = bankTranList !== null ? childText(bankTranList, 'DTEND') : null;

  const stmttrns = findAll(statementNode, 'STMTTRN');
  const rows = stmttrns.map((stmttrn, index) => extractRow(stmttrn, index, rowCurrency, exponent, unknownCurrency));

  return {
    source: 'ofx',
    layoutSignature: layoutSignatureFor(statementNode, kind),
    accountHint: kind,
    currency,
    rows,
    statedOpening: null,
    statedClosing: readStatedBalance(statementNode, 'LEDGERBAL', exponent),
    available: readStatedBalance(statementNode, 'AVAILBAL', exponent),
    statedLimit: null,
    balanceLabel: null,
    labels: [],
    periodStart: dtStartText !== null ? ofxLocalDate(dtStartText) : null,
    periodEnd: dtEndText !== null ? ofxLocalDate(dtEndText) : null,
    warnings: treeWarnings,
  };
}

export function parseOfx(text: string, opts: ParseOfxOptions): ParseOfxResult {
  const headerResult = splitOfxHeader(text);
  if (!headerResult.ok) return { ok: false, error: headerResult.error };

  const tokenizeResult = tokenizeOfx(headerResult.body);
  if (!tokenizeResult.ok) return { ok: false, error: tokenizeResult.error };

  const treeResult = buildOfxTree(tokenizeResult.tokens);
  if (!treeResult.ok) return { ok: false, error: treeResult.error };

  const { root, warnings } = treeResult;
  const statements = collectStatements(root);

  if (statements.length === 0) {
    const unsupportedCount = findAll(root, 'INVSTMTRS').length + findAll(root, 'LOANSTMTRS').length;
    return { ok: false, error: unsupportedCount > 0 ? 'unsupported-statement' : 'no-statements' };
  }

  const drafts = statements.map(({ node, kind }) => extractDraft(node, kind, opts, warnings));
  return { ok: true, drafts };
}
