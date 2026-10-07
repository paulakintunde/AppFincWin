// CSV column mapping (REC-10, D-11): every detected role is shown and correctable, the date order
// and decimal mark are asked outright when the file cannot settle them (E-CR-02, never
// pre-selected), and an invalid mapping blocks Continue with its reason.
import React, { useState } from 'react';
import { View } from 'react-native';
import type { ColumnMapping, DateFormat, MappingError } from '@/engine/csv';
import { useT } from '@/i18n';
import { OptionPicker } from '@/features/record/entry/pickers/OptionPicker';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { space } from '@/theme/layout';
import { Actions, Heading, T } from './importUi';
import type { useStatementImport } from './useStatementImport';

type ImportState = ReturnType<typeof useStatementImport>;
type Role = keyof ColumnMapping;

const ROLES: readonly Role[] = ['date', 'description', 'amount', 'debit', 'credit', 'direction', 'balance', 'currency', 'limit'];
const ALL_FORMATS: readonly DateFormat[] = ['YMD', 'DMY', 'MDY'];
const AMBIGUOUS_FORMATS: readonly DateFormat[] = ['DMY', 'MDY'];
const NONE = 'none';

const ERROR_KEY: Record<MappingError, 'noDate' | 'noDescription' | 'noAmount' | 'amountAndDebitCredit' | 'duplicateColumn'> = {
  'no-date': 'noDate',
  'no-description': 'noDescription',
  'no-amount': 'noAmount',
  'amount-and-debit-credit': 'amountAndDebitCredit',
  'duplicate-column': 'duplicateColumn',
};

export function MappingStep({ state }: { state: ImportState }) {
  const t = useT();
  const [role, setRole] = useState<Role | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const { mapping, headers } = state;

  if (mapping === null) return null;

  const headerName = (index: number | null): string => {
    if (index === null) return t('importCsv.column.ignore');
    const name = headers[index];
    return name === undefined || name.trim() === '' ? String(index + 1) : name;
  };

  const formatLabel = (f: DateFormat): string => t(`importCsv.formats.${f}`);
  const blocked = state.mappingErrors.length > 0 || state.dateNeedsChoice || state.notationNeedsChoice;

  const roleOptions = [
    { value: NONE, label: t('importCsv.column.ignore') },
    ...headers.map((_, i) => ({ value: String(i), label: headerName(i) })),
  ];

  const decimalRows: { mark: '.' | ','; label: string }[] = [
    { mark: '.', label: t('importCsv.decimalPoint') },
    { mark: ',', label: t('importCsv.decimalComma') },
  ];

  return (
    <View>
      <Heading>{t('importCsv.mappingHeading')}</Heading>

      {ROLES.map((r) => (
        <Row key={r} label={t(`importCsv.column.${r}`)} value={headerName(mapping[r])} chevron onPress={() => setRole(r)} />
      ))}

      {state.dateAmbiguous ? (
        <View style={{ paddingTop: space.gapMd }}>
          <T>{t('importCsv.dateFormatAmbiguous')}</T>
          {AMBIGUOUS_FORMATS.map((f) => (
            <Row
              key={f}
              label={formatLabel(f)}
              value={!state.dateNeedsChoice && state.dateFormat === f ? '✓' : undefined}
              onPress={() => state.setDateFormat(f)}
            />
          ))}
        </View>
      ) : state.dateFormat !== null ? (
        <Row label={t('importCsv.dateFormat', { format: formatLabel(state.dateFormat) })} chevron onPress={() => setDateOpen(true)} />
      ) : null}

      <View style={{ paddingTop: space.gapMd }}>
        <T role="label" tone="inkMuted">
          {t('importCsv.decimalMark')}
        </T>
        {state.notationNeedsChoice ? <T>{t('importCsv.decimalMarkAmbiguous')}</T> : null}
        {decimalRows.map((d) => (
          <Row
            key={d.mark}
            label={d.label}
            value={!state.notationNeedsChoice && state.decimalMark === d.mark ? '✓' : undefined}
            onPress={() => state.setDecimalMark(d.mark)}
          />
        ))}
      </View>

      {state.mappingErrors.map((e) => (
        <T key={e} tone="inkMuted">
          {t(`importCsv.mappingError.${ERROR_KEY[e]}`)}
        </T>
      ))}

      <Actions>
        <Pill label={t('importCsv.continue')} variant="secondary" disabled={blocked} onPress={() => void state.continue()} />
        <Pill label={t('importCsv.back')} variant="secondary" onPress={state.back} />
        <Pill label={t('importCsv.cancel')} variant="secondary" onPress={state.cancel} />
      </Actions>

      <OptionPicker
        visible={role !== null}
        title={role === null ? '' : t(`importCsv.column.${role}`)}
        options={roleOptions}
        selected={role === null ? null : mapping[role] === null ? NONE : String(mapping[role])}
        onSelect={(value) => {
          if (role !== null) state.setMapping({ ...mapping, [role]: value === NONE ? null : Number(value) });
          setRole(null);
        }}
        onClose={() => setRole(null)}
      />
      <OptionPicker
        visible={dateOpen}
        title={t('importCsv.column.date')}
        options={ALL_FORMATS.map((f) => ({ value: f, label: formatLabel(f) }))}
        selected={state.dateFormat}
        onSelect={(f) => {
          state.setDateFormat(f);
          setDateOpen(false);
        }}
        onClose={() => setDateOpen(false)}
      />
    </View>
  );
}
