// The statement import as one state machine (D-40, UI-SPEC pipeline): idle -> reading ->
// (rejected | choose-statement | format | mapping) -> review -> matches -> committing -> done.
// It drives the pure pipeline (importPipeline.ts, 02-26) and renders nothing; the screens
// (02-27) only read what it returns and call what it exposes.
//
// D-39: the file's bytes are read on this device, parsed, and dropped; statement content
// (descriptions, amounts, account numbers, the file's own label) never reaches an analytics
// property, a toast parameter, a log or an error. Funnel events carry literal unions and
// booleans only (ANL-05).
// D-42: an ambiguous reading has no selected profile, so nothing can be committed until the
// user chooses; a remembered reading that still reconciles skips the format step.
// D-17 / D-29: every database read has a fallback, so a preview never waits on the network.
import { useCallback, useMemo, useRef, useState } from 'react';
import { validateMapping, notationFor, type ColumnMapping, type DateFormat, type MappingError } from '@/engine/csv';
import { minorUnits, resolveExponent, type NumberNotation } from '@/engine/money';
import {
  convertDraft,
  flipProfile,
  type ConvertedRow,
  type FormatProfile,
  type StatementDraft,
} from '@/engine/statement';
import { fetchImportProfile } from '@/db/importProfiles';
import type { AccountRow } from '@/db/rows';
import { useAccounts } from '@/data/queries/accounts';
import { useRecordContext } from '@/features/record/useRecordContext';
import { pickStatementBytes } from '@/services/files/pickStatement';
import { getAnalytics, type EventName, type EventProps } from '@/services/analytics';
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { supabase } from '@/services/supabase';
import {
  prepareImport,
  resolveCsvDraft,
  resolveProfile,
  statementOptions,
  type ImportFormat,
  type PreparedImport,
  type PreviewAccount,
  type RejectReason,
} from './importPipeline';

export type ImportStage =
  | 'idle'
  | 'reading'
  | 'rejected'
  | 'choose-statement'
  | 'format'
  | 'mapping'
  | 'review'
  | 'matches'
  | 'committing'
  | 'done';

export type ImportEntry = 'onboarding' | 'you' | 'account';

type AbandonStage = 'pick' | 'format' | 'mapping' | 'review' | 'matches';

interface Machine {
  stage: ImportStage;
  rejectReason: RejectReason | null;
  prepared: PreparedImport | null;
  statementIndex: number | null;
  accountId: string | null;
  draft: StatementDraft | null;
  profile: FormatProfile | null;
  candidates: FormatProfile[];
  rememberedNote: boolean;
  flipped: boolean;
  /** The balance and direction roles the profile was resolved under (D-53). */
  rolesKey: string | null;
  mapping: ColumnMapping | null;
  mappingEdited: boolean;
  dateFormat: DateFormat | null;
  dateChosen: boolean;
  dateEdited: boolean;
  notation: NumberNotation | null;
  notationChosen: boolean;
  notationEdited: boolean;
}

function initialMachine(accountId: string | null): Machine {
  return {
    stage: 'idle',
    rejectReason: null,
    prepared: null,
    statementIndex: null,
    accountId,
    draft: null,
    profile: null,
    candidates: [],
    rememberedNote: false,
    flipped: false,
    rolesKey: null,
    mapping: null,
    mappingEdited: false,
    dateFormat: null,
    dateChosen: false,
    dateEdited: false,
    notation: null,
    notationChosen: false,
    notationEdited: false,
  };
}

/** Unknown currency code -> null (the pipeline then refuses rather than guessing a scale). */
function exponentFor(code: string): number | null {
  try {
    return resolveExponent(code);
  } catch {
    return null;
  }
}

function isDayFirst(locale: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat(locale, { timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(2026, 11, 31)));
    const day = parts.findIndex((p) => p.type === 'day');
    const month = parts.findIndex((p) => p.type === 'month');
    return day !== -1 && month !== -1 && day < month;
  } catch {
    return false;
  }
}

function rolesKeyOf(m: ColumnMapping): string {
  return JSON.stringify([m.amount, m.debit, m.credit, m.balance, m.direction, m.limit]);
}

function previewAccountOf(a: AccountRow): PreviewAccount {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    currency: a.currency,
    overdraftLimit: a.overdraft_limit,
    creditLimit: a.credit_limit,
  };
}

function track<E extends EventName>(name: E, props: EventProps<E>): void {
  getAnalytics().track(name, props);
}

export function useStatementImport({ entry, accountId: initialAccountId = null }: { entry: ImportEntry; accountId?: string | null }) {
  const ctx = useRecordContext();
  const accountsQuery = useAccounts(ctx.householdId ?? undefined);
  const device = useDeviceLocale(ctx.region);
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);

  const [m, setM] = useState<Machine>(() => initialMachine(initialAccountId));
  const run = useRef(0); // bumped on every restart or cancel, so a late read is dropped

  const region = useMemo(
    () => ({ decimal: (device.separators?.decimal === ',' ? ',' : '.') as '.' | ',', dayFirst: isDayFirst(device.locale) }),
    [device.separators?.decimal, device.locale]
  );

  const patch = useCallback((p: Partial<Machine>) => setM((prev) => ({ ...prev, ...p })), []);

  const accountById = useCallback((id: string | null): AccountRow | null => (id === null ? null : (accounts.find((a) => a.id === id) ?? null)), [accounts]);

  /** The draft under the current mapping choices (CSV) or the chosen statement (OFX). */
  const draftFor = useCallback(
    (s: Machine, account: AccountRow): StatementDraft | null => {
      if (s.prepared === null) return null;
      if (s.prepared.format !== 'csv') return s.prepared.statements[s.statementIndex ?? 0] ?? null;
      if (s.mapping === null || s.dateFormat === null || s.notation === null) return null;
      try {
        return resolveCsvDraft(
          s.prepared.csv,
          { mapping: s.mapping, dateFormat: s.dateFormat, notation: s.notation, account: { currency: account.currency } },
          exponentFor
        );
      } catch {
        return null; // an account currency with no known scale
      }
    },
    []
  );

  /** The remembered reading for this layout, or null when absent or unreadable (D-17, D-42). */
  const rememberedFor = useCallback(
    async (draft: StatementDraft, accountId: string) => {
      if (ctx.userId === null) return null;
      try {
        const row = await fetchImportProfile(supabase, ctx.userId, accountId, draft.layoutSignature);
        return row === null ? null : { accountId, signature: draft.layoutSignature, profile: row.profile };
      } catch {
        return null;
      }
    },
    [ctx.userId]
  );

  // Review (Task 2 fills this in).
  const goReview = useCallback(
    (_draft: StatementDraft, _profile: FormatProfile, _accountId: string, _format: ImportFormat) => {
      patch({ stage: 'review' });
    },
    [patch]
  );

  /**
   * Reads the draft for the chosen account and resolves how it reads (D-41, D-53). Decided ->
   * the format step (or straight on when the remembered reading still holds); ambiguous ->
   * the format step with the candidates and no selected profile.
   */
  const derive = useCallback(
    async (s: Machine, accountId: string): Promise<void> => {
      const account = accountById(accountId);
      if (s.prepared === null || account === null) return;
      const token = ++run.current;
      const draft = draftFor(s, account);
      if (draft === null) {
        patch({ stage: 'rejected', rejectReason: 'unreadable' });
        return;
      }
      const remembered = await rememberedFor(draft, accountId);
      if (token !== run.current) return;

      const result = resolveProfile(draft, previewAccountOf(account), remembered);
      const rolesKey = s.mapping === null ? null : rolesKeyOf(s.mapping);
      const format = s.prepared.format;
      if (result.kind === 'ambiguous') {
        patch({ draft, accountId, profile: null, candidates: result.candidates, rememberedNote: false, flipped: false, rolesKey, stage: 'format' });
        return;
      }
      const skip = result.profile.decidedBy === 'remembered';
      patch({
        draft,
        accountId,
        profile: result.profile,
        candidates: [],
        rememberedNote: skip,
        flipped: false,
        rolesKey,
        stage: skip ? (format === 'csv' ? 'mapping' : 'review') : 'format',
      });
      if (skip && format !== 'csv') goReview(draft, result.profile, accountId, format);
    },
    [accountById, draftFor, goReview, patch, rememberedFor]
  );

  const start = useCallback((): void => {
    const token = ++run.current;
    track('import_started', { entry });
    setM(() => ({ ...initialMachine(m.accountId), stage: 'reading' }));
    void (async () => {
      const picked = await pickStatementBytes();
      if (token !== run.current) return;
      if (picked.kind === 'canceled') {
        patch({ stage: 'idle' });
        return;
      }
      if (picked.kind === 'rejected') {
        track('import_file_rejected', { reason: picked.reason });
        patch({ stage: 'rejected', rejectReason: picked.reason });
        return;
      }
      let prepared: ReturnType<typeof prepareImport>;
      try {
        prepared = prepareImport(picked.bytes, { extension: picked.extension }, region, exponentFor);
      } catch {
        prepared = { ok: false, reason: 'unreadable' };
      }
      if (!prepared.ok) {
        track('import_file_rejected', { reason: prepared.reason });
        patch({ stage: 'rejected', rejectReason: prepared.reason });
        return;
      }
      const p = prepared.prepared;
      const next: Machine = { ...initialMachine(m.accountId), prepared: p };
      if (p.format === 'csv') {
        next.mapping = p.csv.detected;
        next.dateFormat = p.csv.dateFormat;
        next.notation = p.csv.notation;
      } else if (p.statements.length > 1) {
        setM({ ...next, stage: 'choose-statement' });
        return;
      } else {
        next.statementIndex = 0;
      }
      // Without an account yet the format step waits for one (setAccount continues).
      setM({ ...next, stage: 'format' });
      if (next.accountId !== null) await derive(next, next.accountId);
    })();
  }, [derive, entry, m.accountId, patch, region]);

  const chooseStatement = useCallback(
    (index: number): void => {
      if (m.stage !== 'choose-statement' || m.prepared === null || m.prepared.format === 'csv') return;
      if (m.prepared.statements[index] === undefined) return;
      const next: Machine = { ...m, statementIndex: index, stage: 'format' };
      setM(next);
      if (next.accountId !== null) void derive(next, next.accountId);
    },
    [derive, m]
  );

  const setAccount = useCallback(
    (id: string): void => {
      if (m.stage === 'review' || m.stage === 'matches' || m.stage === 'committing' || m.stage === 'done') return;
      const next: Machine = { ...m, accountId: id };
      setM(next);
      // The account kind fixes what the balance means, so the reading is worked out again (D-53).
      if (next.prepared !== null && (next.stage === 'format' || next.stage === 'mapping')) void derive(next, id);
    },
    [derive, m]
  );

  const flip = useCallback((): void => {
    if (m.profile === null || m.stage !== 'format') return;
    patch({ profile: flipProfile(m.profile), flipped: true });
  }, [m.profile, m.stage, patch]);

  const chooseCandidate = useCallback(
    (i: number): void => {
      const c = m.candidates[i];
      if (m.stage !== 'format' || c === undefined) return;
      patch({ profile: { ...c, decidedBy: 'user' }, flipped: false });
    },
    [m.candidates, m.stage, patch]
  );

  const confirmFormat = useCallback((): void => {
    if (m.stage !== 'format' || m.profile === null || m.prepared === null || m.draft === null || m.accountId === null) return;
    const format: ImportFormat = m.prepared.format;
    track('import_format_confirmed', { format, decided_by: m.profile.decidedBy, flipped: m.flipped });
    if (format === 'csv') patch({ stage: 'mapping' });
    else goReview(m.draft, m.profile, m.accountId, format);
  }, [goReview, m, patch]);

  // --- mapping (CSV only) ---------------------------------------------------------------

  const mappingErrors: MappingError[] = useMemo(() => (m.mapping === null ? [] : validateMapping(m.mapping)), [m.mapping]);
  const dateAmbiguous = m.prepared !== null && m.prepared.format === 'csv' ? m.prepared.csv.dateAmbiguous : false;
  const notationAmbiguous = m.prepared !== null && m.prepared.format === 'csv' ? m.prepared.csv.notationAmbiguous : false;
  const dateNeedsChoice = dateAmbiguous && !m.dateChosen;
  const notationNeedsChoice = notationAmbiguous && !m.notationChosen;

  /** Re-derives the draft under new mapping choices; an invalid mapping keeps the old draft. */
  const redraft = useCallback(
    (s: Machine): Machine => {
      const account = accountById(s.accountId);
      if (account === null || s.mapping === null || validateMapping(s.mapping).length > 0) return s;
      const draft = draftFor(s, account);
      return draft === null ? s : { ...s, draft };
    },
    [accountById, draftFor]
  );

  const setMapping = useCallback(
    (mapping: ColumnMapping): void => {
      if (m.stage !== 'mapping' || m.prepared === null || m.prepared.format !== 'csv') return;
      const edited = JSON.stringify(mapping) !== JSON.stringify(m.prepared.csv.detected);
      setM(redraft({ ...m, mapping, mappingEdited: edited }));
    },
    [m, redraft]
  );

  const setDateFormat = useCallback(
    (f: DateFormat): void => {
      if (m.stage !== 'mapping' || m.prepared === null || m.prepared.format !== 'csv') return;
      const edited = f !== m.prepared.csv.dateFormat;
      setM(redraft({ ...m, dateFormat: f, dateChosen: true, dateEdited: edited }));
    },
    [m, redraft]
  );

  const setDecimalMark = useCallback(
    (mark: '.' | ','): void => {
      if (m.stage !== 'mapping' || m.prepared === null || m.prepared.format !== 'csv') return;
      const edited = mark !== m.prepared.csv.notation.decimal;
      setM(redraft({ ...m, notation: notationFor(mark), notationChosen: true, notationEdited: edited }));
    },
    [m, redraft]
  );

  const continueFromMapping = useCallback(async (): Promise<void> => {
    if (m.prepared === null || m.prepared.format !== 'csv' || m.profile === null || m.mapping === null) return;
    if (mappingErrors.length > 0 || dateNeedsChoice || notationNeedsChoice) return;
    const account = accountById(m.accountId);
    if (account === null) return;
    const draft = draftFor(m, account);
    if (draft === null) return;

    track('import_mapping_confirmed', { corrected: m.mappingEdited || m.dateEdited || m.notationEdited });

    const rolesKey = rolesKeyOf(m.mapping);
    if (rolesKey === m.rolesKey) {
      patch({ draft });
      goReview(draft, m.profile, account.id, 'csv');
      return;
    }
    // The balance or direction roles moved: the reading is resolved again (D-53).
    const token = ++run.current;
    const remembered = await rememberedFor(draft, account.id);
    if (token !== run.current) return;
    const result = resolveProfile(draft, previewAccountOf(account), remembered);
    if (result.kind === 'ambiguous') {
      patch({ draft, profile: null, candidates: result.candidates, rememberedNote: false, flipped: false, rolesKey, stage: 'format' });
      return;
    }
    const same = result.profile.positiveMeans === m.profile.positiveMeans && result.profile.balanceMeans === m.profile.balanceMeans;
    if (same) {
      patch({ draft, rolesKey });
      goReview(draft, m.profile, account.id, 'csv');
      return;
    }
    // A different reading than the one the user confirmed is shown again, never swapped silently.
    patch({ draft, profile: result.profile, candidates: [], rememberedNote: result.profile.decidedBy === 'remembered', flipped: false, rolesKey, stage: 'format' });
  }, [accountById, dateNeedsChoice, draftFor, goReview, m, mappingErrors.length, notationNeedsChoice, patch, rememberedFor]);

  const continueStage = useCallback((): Promise<void> | void => {
    if (m.stage === 'mapping') return continueFromMapping();
    return undefined;
  }, [continueFromMapping, m.stage]);

  const back = useCallback((): void => {
    if (m.stage === 'mapping') patch({ stage: 'format' });
    else if (m.stage === 'review') patch({ stage: m.prepared?.format === 'csv' ? 'mapping' : 'format' });
    else if (m.stage === 'matches') patch({ stage: 'review' });
  }, [m.prepared, m.stage, patch]);

  const cancel = useCallback((): void => {
    const at: AbandonStage | null =
      m.stage === 'reading' || m.stage === 'choose-statement'
        ? 'pick'
        : m.stage === 'format' || m.stage === 'mapping' || m.stage === 'review' || m.stage === 'matches'
          ? m.stage
          : null;
    if (m.stage === 'committing') return;
    run.current += 1;
    if (at !== null) track('import_abandoned', { stage: at });
    setM(initialMachine(m.accountId));
  }, [m.accountId, m.stage]);

  const exampleRow: ConvertedRow | null = useMemo(() => {
    if (m.draft === null || m.profile === null) return null;
    const account = accountById(m.accountId);
    if (account === null) return null;
    const row = m.draft.rows.find((r) => r.magnitude !== null);
    if (row === undefined) return null;
    const own = m.profile.accountFamily === 'card' ? account.credit_limit : account.overdraft_limit;
    const limit = m.profile.accountFamily === 'card' ? (own ?? m.profile.statedLimit) : own;
    const converted = convertDraft({ ...m.draft, rows: [row], statedOpening: null, statedClosing: null, available: null }, m.profile, {
      limit: limit === null ? null : minorUnits(limit),
    });
    return converted.rows[0] ?? null;
  }, [accountById, m.accountId, m.draft, m.profile]);

  const statementChoices = useMemo(
    () => (m.prepared !== null && m.prepared.format !== 'csv' ? statementOptions(m.prepared.statements) : []),
    [m.prepared]
  );

  return {
    stage: m.stage,
    rejectReason: m.rejectReason,
    format: (m.prepared?.format ?? null) as ImportFormat | null,
    statementChoices,
    chooseStatement,
    accountId: m.accountId,
    setAccount,
    profile: m.profile,
    candidates: m.candidates,
    rememberedNote: m.rememberedNote,
    exampleRow,
    flip,
    chooseCandidate,
    confirmFormat,
    mapping: m.mapping,
    mappingErrors,
    dateFormat: m.dateFormat,
    dateAmbiguous,
    dateNeedsChoice,
    decimalMark: (m.notation?.decimal ?? null) as '.' | ',' | null,
    notationAmbiguous,
    notationNeedsChoice,
    setMapping,
    setDateFormat,
    setDecimalMark,
    start,
    cancel,
    continue: continueStage,
    back,
  };
}
