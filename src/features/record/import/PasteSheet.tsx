// REC-21 (CONTEXT D-20, D-21): the "Paste to add" sheet. Pasted text is parsed live by the
// strict engine parser (pasteModel); each ready line shows its guessed category (editable) and
// a duplicate note; Add inserts every ready line as pending, as one undo step (usePasteLines).
// Skipped lines are listed after the commit. No device-only privacy claim here (UI-SPEC 9).
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchCategorisedNames } from "@/db/transactions";
import { useAccounts } from "@/data/queries/accounts";
import { useMonthView } from "@/data/queries/activity";
import { useCategoryLookup } from "@/data/queries/categories";
import { usePasteLines } from "@/data/mutations/pasteLines";
import { buildLearnedMap } from "@/engine/categorize";
import { currencyExponent, money } from "@/engine/money";
import type { ExistingRow } from "@/engine/statement";
import { useRecordContext } from "@/features/record/useRecordContext";
import { categoryName } from "@/features/record/categoryName";
import { AccountPicker } from "@/features/record/entry/pickers/AccountPicker";
import { CategoryPicker } from "@/features/record/entry/pickers/CategoryPicker";
import { useT } from "@/i18n";
import { supabase } from "@/services/supabase";
import { useDeviceLocale } from "@/services/locale/deviceLocale";
import { showToast, TOAST_MS_ORDINARY } from "@/state/undoToast";
import { useTheme } from "@/theme/ThemeProvider";
import { radii, space } from "@/theme/layout";
import { textRole } from "@/theme/typography";
import { Chip } from "@/ui/Chip";
import { Pill } from "@/ui/Pill";
import { Row } from "@/ui/Row";
import { Sheet, SheetScroll } from "@/ui/Sheet";
import { SheetHeader } from "@/ui/SheetHeader";
import { useMoneyFormatter } from "@/ui/money/useMoneyFormatter";
import { buildPastePreview } from "./pasteModel";

export interface PasteSheetProps {
  visible: boolean;
  /** The viewed month, 'YYYY-MM'. */
  month: string;
  onClose: () => void;
  /** Switches to the CSV statement flow. */
  onCsv?: () => void;
}

const NO_OVERRIDES: ReadonlyMap<number, string | null> = new Map();

export function PasteSheet({
  visible,
  month,
  onClose,
  onCsv,
}: PasteSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const { locale, separators } = useDeviceLocale();
  const formatter = useMoneyFormatter(rc.showCents);
  const lookup = useCategoryLookup(rc.userId ?? undefined);
  const accounts = (useAccounts(rc.householdId ?? undefined).data ?? []).filter(
    (a) => a.archived_at === null,
  );
  const monthView = useMonthView(
    {
      householdId: rc.householdId,
      homeCurrency: rc.homeCurrency,
      today: rc.today,
    },
    month,
  );
  const paste = usePasteLines();
  const title = t("importCsv.paste.title");

  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [overrides, setOverrides] =
    useState<ReadonlyMap<number, string | null>>(NO_OVERRIDES);
  const [pickingAccount, setPickingAccount] = useState(false);
  const [pickingLine, setPickingLine] = useState<number | null>(null);
  const [emptyNote, setEmptyNote] = useState(false);

  // Default account: the one the viewed month's newest line used, else the first active account.
  const defaultAccountId = useMemo(() => {
    const recent = [...monthView.rows].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
    for (const row of recent)
      if (accounts.some((a) => a.id === row.account_id)) return row.account_id;
    return accounts[0]?.id ?? null;
  }, [monthView.rows, accounts]);
  const account =
    accounts.find((a) => a.id === (accountId ?? defaultAccountId)) ?? null;
  const currency = account?.currency ?? rc.homeCurrency;

  const names = useQuery({
    queryKey: ["pasteGuessNames", rc.householdId, rc.userId],
    queryFn: () =>
      fetchCategorisedNames(
        supabase,
        rc.householdId as string,
        rc.userId as string,
      ),
    enabled: visible && Boolean(rc.householdId) && Boolean(rc.userId),
  });
  const learned = useMemo(
    () =>
      buildLearnedMap(
        (names.data ?? []).map((n) => ({
          name: n.name,
          categoryId: n.category_id,
          updatedAt: n.updated_at,
        })),
      ),
    [names.data],
  );

  const existing = useMemo<ExistingRow[]>(
    () =>
      monthView.rows.map((r) => ({
        id: r.id,
        localDate: r.local_date,
        amount: r.original_amount,
        name: r.name,
        externalId: r.external_id,
        importFormat: r.import_format,
      })),
    [monthView.rows],
  );

  const preview = useMemo(
    () =>
      buildPastePreview(text, {
        parse: {
          locale,
          separators,
          currency,
          exponent: currencyExponent(currency),
          today: rc.today,
          month,
        },
        guess: { learned, builtinIds: lookup.builtinIds },
        existing,
        overrides,
      }),
    [
      text,
      locale,
      separators,
      currency,
      rc.today,
      month,
      learned,
      lookup.builtinIds,
      existing,
      overrides,
    ],
  );

  const reset = () => {
    setText("");
    setOverrides(NO_OVERRIDES);
    setEmptyNote(false);
    setAccountId(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const lines = preview.ok ? preview.lines : [];
  const skipped = preview.ok ? preview.skipped : [];
  const hasText = text.trim().length > 0;

  const countLine = !hasText
    ? null
    : !preview.ok
      ? t("importCsv.tooManyRows")
      : skipped.length > 0
        ? t("importCsv.paste.readySkipped", {
            ready: lines.length,
            skipped: skipped.length,
          })
        : t("importCsv.paste.ready", { count: lines.length });

  const categoryLabel = (id: string | null): string => {
    const c = id === null ? undefined : lookup.byId.get(id);
    return c ? categoryName(c, t) : t("record.sheet.uncategorised");
  };

  const add = () => {
    if (!hasText) {
      setEmptyNote(true);
      return;
    }
    if (
      !preview.ok ||
      lines.length === 0 ||
      account === null ||
      rc.householdId === null ||
      rc.userId === null
    )
      return;
    const skippedNow = skipped.map((s) =>
      t("importCsv.paste.lineRef", { n: s.lineNo }),
    );
    paste.add({
      lines,
      householdId: rc.householdId,
      ownerId: rc.userId,
      accountId: account.id,
      currency: account.currency,
      homeCurrency: rc.homeCurrency,
      timeZone: rc.timeZone,
      month,
    });
    if (skippedNow.length > 0) {
      // Queued after the undo toast so the two never stack (UI-SPEC 15).
      setTimeout(
        () =>
          showToast({
            kind: "info",
            text: {
              key: "importCsv.paste.skipped",
              params: {
                count: skippedNow.length,
                lines: skippedNow.join(", "),
              },
            },
          }),
        TOAST_MS_ORDINARY,
      );
    }
    close();
  };

  const fieldStyle = [
    textRole(pairing, "body"),
    styles.field,
    {
      backgroundColor: colors.fill1,
      color: colors.ink,
      borderRadius: radii.card / 2,
      borderColor: focused ? colors.accent : colors.inkFaint,
    },
  ];
  const mutedStyle = [textRole(pairing, "label"), { color: colors.inkMuted }];

  const ctaDisabled = hasText && lines.length === 0;

  return (
    <Sheet visible={visible} onDismiss={close} accessibilityLabel={title}>
      <SheetHeader
        title={title}
        cancelLabel={t("record.sheet.cancel")}
        onCancel={close}
      />
      <SheetScroll>
        <Text style={mutedStyle}>{t("importCsv.paste.helper")}</Text>
        <TextInput
          accessibilityLabel={t("importCsv.paste.fieldA11y")}
          multiline
          numberOfLines={5}
          value={text}
          onChangeText={(v) => {
            setText(v);
            setEmptyNote(false);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t("importCsv.paste.placeholder")}
          placeholderTextColor={colors.inkFaint}
          style={fieldStyle}
        />
        <Row
          label={t("record.sheet.field.account")}
          value={account?.name ?? ""}
          dense
          chevron
          onPress={() => setPickingAccount(true)}
        />
        {countLine ? <Text style={mutedStyle}>{countLine}</Text> : null}
        {emptyNote ? (
          <Text style={[textRole(pairing, "label"), { color: colors.danger }]}>
            {t("importCsv.paste.empty")}
          </Text>
        ) : null}
        {lines.map((line) => (
          <View key={line.lineNo}>
            <Row
              label={line.name}
              value={formatter.formatMoney(money(line.amount, currency))}
              sublabel={
                line.duplicate
                  ? `${formatter.formatDate(line.localDate)} · ${t("importCsv.paste.duplicate")}`
                  : formatter.formatDate(line.localDate)
              }
              dense
            />
            <View style={styles.chipRow}>
              <Chip
                label={categoryLabel(line.categoryId)}
                accessibilityLabel={`${line.name}: ${categoryLabel(line.categoryId)}`}
                onPress={() => setPickingLine(line.lineNo)}
              />
            </View>
          </View>
        ))}
        <View style={styles.actions}>
          <Pill
            label={t("importCsv.paste.cta", { count: lines.length })}
            variant="primary"
            disabled={ctaDisabled}
            onPress={add}
          />
          <Pill
            label={t("importCsv.paste.csv")}
            variant="secondary"
            onPress={() => {
              reset();
              onCsv?.();
            }}
          />
        </View>
      </SheetScroll>
      <AccountPicker
        visible={pickingAccount}
        title={t("record.sheet.field.account")}
        accounts={accounts}
        selectedId={account?.id ?? null}
        onSelect={(a) => {
          setAccountId(a.id);
          setPickingAccount(false);
        }}
        onClose={() => setPickingAccount(false)}
      />
      <CategoryPicker
        visible={pickingLine !== null}
        categories={lookup.active}
        selectedId={
          pickingLine === null
            ? null
            : (lines.find((l) => l.lineNo === pickingLine)?.categoryId ?? null)
        }
        onSelect={(id) => {
          if (pickingLine !== null)
            setOverrides((prev) => new Map(prev).set(pickingLine, id));
          setPickingLine(null);
        }}
        onClose={() => setPickingLine(null)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 120,
    padding: space.gapMd,
    borderWidth: 1,
    textAlignVertical: "top",
    marginVertical: space.gapMd,
  },
  chipRow: { flexDirection: "row", paddingBottom: space.gapSm },
  actions: { gap: space.gapSm, paddingTop: space.groupGap },
});
