// The statement import screen (REC-09, REC-10, REC-13, REC-15..REC-18, D-12, D-17, D-39): renders
// each stage of useStatementImport (02-39) -- account and file pick, statement choice, format,
// mapping, review, matches and the post-commit recurring suggestions. The machine decides what
// is allowed; this screen only shows it and calls what the hook exposes.
//
// D-39: the file is read on this device. Nothing here logs, tracks or stores statement text.
import React, { useState } from 'react';
import { View } from 'react-native';
import { useAccounts } from '@/data/queries/accounts';
import { AccountSheet } from '@/features/record/accounts/AccountSheet';
import { useRecordContext } from '@/features/record/useRecordContext';
import { monthOf } from '@/engine/time';
import { useT } from '@/i18n';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Screen } from '@/ui/Screen';
import { space } from '@/theme/layout';
import { FormatStep } from './FormatStep';
import { PasteSheet } from './PasteSheet';
import { MappingStep } from './MappingStep';
import { MatchesStep } from './MatchesStep';
import { ReviewStep } from './ReviewStep';
import { SuggestionsStep } from './SuggestionsStep';
import { Actions, Heading, T } from './importUi';
import { useStatementImport, type ImportEntry } from './useStatementImport';
import type { RejectReason } from './importPipeline';

type ImportState = ReturnType<typeof useStatementImport>;

export interface ImportScreenProps {
  entry: ImportEntry;
  accountId?: string | null;
  onDone: () => void;
}

const REJECT_KEY: Record<RejectReason, 'tooManyRows' | 'unreadable' | 'noRows' | 'tooBig' | 'unsupportedFormat' | 'unsupportedStatement'> = {
  too_many_rows: 'tooManyRows',
  unreadable: 'unreadable',
  no_rows: 'noRows',
  too_big: 'tooBig',
  unsupported_format: 'unsupportedFormat',
  unsupported_statement: 'unsupportedStatement',
};

export function ImportScreen({ entry, accountId = null, onDone }: ImportScreenProps) {
  const state = useStatementImport({ entry, accountId });
  const t = useT();

  return (
    <Screen scroll={state.stage !== 'review'}>
      <View style={state.stage === 'review' ? { flex: 1 } : { paddingBottom: space.groupGap }}>
        {state.rememberedNote && (state.stage === 'mapping' || state.stage === 'review') ? (
          <T tone="inkMuted">{t('importCsv.format.remembered')}</T>
        ) : null}
        <StageView state={state} entry={entry} onDone={onDone} />
      </View>
    </Screen>
  );
}

function StageView({ state, entry, onDone }: { state: ImportState; entry: ImportEntry; onDone: () => void }) {
  const t = useT();
  switch (state.stage) {
    case 'idle':
    case 'reading':
      return <PickStep state={state} entry={entry} />;
    case 'rejected':
      return <RejectedStep state={state} />;
    case 'choose-statement':
      return <ChooseStatementStep state={state} />;
    case 'format':
      return <FormatStep state={state} />;
    case 'mapping':
      return <MappingStep state={state} />;
    case 'review':
      return <ReviewStep state={state} />;
    case 'matches':
      return <MatchesStep state={state} />;
    case 'committing':
      return <T tone="inkMuted">{t('importCsv.committing')}</T>;
    case 'done':
      return <SuggestionsStep state={state} onDone={onDone} />;
    default:
      return null;
  }
}

function PickStep({ state, entry }: { state: ImportState; entry: ImportEntry }) {
  const t = useT();
  const rc = useRecordContext();
  const accounts = (useAccounts(rc.householdId ?? undefined).data ?? []).filter((a) => a.archived_at === null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  return (
    <View>
      <Row label={t('importCsv.paste.entry')} sublabel={t('importCsv.paste.entrySub')} chevron onPress={() => setPasteOpen(true)} />
      <T tone="inkMuted">{t('importCsv.privacy')}</T>
      <View style={{ paddingTop: space.gapMd }}>
        <Heading>{t('importCsv.pickAccount')}</Heading>
        {accounts.map((a) => (
          <Row
            key={a.id}
            label={a.name}
            value={a.id === state.accountId ? `${a.currency} ✓` : a.currency}
            accessibilityLabel={a.name}
            onPress={() => state.setAccount(a.id)}
          />
        ))}
        <Row label={t('importCsv.newAccount')} chevron onPress={() => setSheetOpen(true)} />
      </View>
      <T tone="inkMuted">{t('importCsv.pickHelper')}</T>
      {state.accountId === null ? <T tone="inkMuted">{t('importCsv.pickAccountFirst')}</T> : null}
      <Actions>
        <Pill
          label={t('importCsv.pick')}
          variant="secondary"
          accessibilityHint={state.accountId === null ? t('importCsv.pickAccountFirst') : undefined}
          disabled={state.accountId === null || state.stage === 'reading'}
          onPress={state.start}
        />
      </Actions>
      <PasteSheet visible={pasteOpen} month={monthOf(rc.today)} onClose={() => setPasteOpen(false)} onCsv={() => setPasteOpen(false)} />
      <AccountSheet
        visible={sheetOpen}
        mode={{ kind: 'new', context: entry === 'onboarding' ? 'onboarding' : 'later' }}
        onClose={() => setSheetOpen(false)}
        onSaved={(id) => {
          setSheetOpen(false);
          state.setAccount(id);
        }}
      />
    </View>
  );
}

function RejectedStep({ state }: { state: ImportState }) {
  const t = useT();
  const reason = state.rejectReason;
  if (reason === null) return null;
  return (
    <View>
      <T tone={reason === 'too_many_rows' ? 'danger' : 'ink'}>{t(`importCsv.${REJECT_KEY[reason]}`)}</T>
      <Actions>
        <Pill label={t('importCsv.back')} variant="secondary" onPress={state.cancel} />
      </Actions>
    </View>
  );
}

function ChooseStatementStep({ state }: { state: ImportState }) {
  const t = useT();
  return (
    <View>
      <Heading>{t('importCsv.pickStatement')}</Heading>
      {state.statementChoices.map((choice) => (
        <Row
          key={choice.index}
          label={t('importCsv.statementOption', {
            kind: t(`importCsv.statementKind.${choice.kind}`),
            currency: choice.currency ?? '',
            count: choice.count,
          })}
          onPress={() => state.chooseStatement(choice.index)}
        />
      ))}
      <Actions>
        <Pill label={t('importCsv.cancel')} variant="secondary" onPress={state.cancel} />
      </Actions>
    </View>
  );
}
