// HOME-04 / D-22 / D-32: Home's Accounts summary. Same balances and 'Waiting for a rate' handling
// as the Accounts screen (AccountBalanceBlock does the work). First 6 active accounts; a tap
// pushes the detail over the tab bar. No active accounts: the card is absent.
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { type Href } from "expo-router";
import { Text } from "@/ui/Text";
import type { AccountBalanceView } from "@/data/queries/activity";
import type { AccountRow } from "@/db/rows";
import {
  AccountBalanceBlock,
  useCompactBalance,
} from "@/features/record/accounts/AccountBalanceBlock";
import { useRecordContext } from "@/features/record/useRecordContext";
import { pushOnce } from "@/shell/navigation/pushOnce";
import { useMoneyFormatter } from "@/ui/money/useMoneyFormatter";
import { useT } from "@/i18n";
import { useTheme } from "@/theme/ThemeProvider";
import { PRESSED_OPACITY, radii, size, space } from "@/theme/layout";
import { FONT_PAIRINGS } from "@/theme/fonts";
import { ACCENT_TINT_OPACITY, shadows } from "@/theme/tokens";
import { fontSize, textRole } from "@/theme/typography";

export const HOME_ACCOUNTS_CAP = 6;

// UI-SPEC prototype-literal exceptions (Home): heading padding 18/20/6, 7px chevron, 13px row gap
// (matches Coming up). The card's end space comes from the tab root's FAB clearance.
const ROW_GAP = 13;
const HEADING_PAD_TOP = 18;
const HEADING_PAD_BOTTOM = 6;
const CHEVRON = 7;

function AccountTile({
  account,
  balance,
  homeCurrency,
  first,
}: {
  account: AccountRow;
  balance: AccountBalanceView | undefined;
  homeCurrency: string;
  first: boolean;
}) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const kind = t(`accounts.kind.${account.kind}`);
  const compact = useCompactBalance(account, balance, homeCurrency);
  const rc = useRecordContext();
  const { locale } = useMoneyFormatter(rc.showCents);
  const initial =
    Array.from(account.name.trim())[0]?.toLocaleUpperCase(locale) ?? "?";
  const label = [account.name, kind, compact.label]
    .filter((p): p is string => p !== null && p !== "")
    .join(", ");
  const cash = account.kind === "cash";
  const sub =
    account.currency !== homeCurrency ? `${kind} · ${account.currency}` : kind;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => pushOnce(`/accounts/${account.id}` as Href)}
      style={({ pressed }) => [
        styles.row,
        first ? null : { borderTopWidth: 1, borderTopColor: colors.fill2 },
        pressed ? { opacity: PRESSED_OPACITY } : null,
      ]}
    >
      <View
        style={[styles.tile, { backgroundColor: colors.fill1 }]}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {cash ? (
          <View
            testID="accent-tint"
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: colors.accent,
                opacity: ACCENT_TINT_OPACITY,
                borderRadius: radii.glyphTile,
              },
            ]}
          />
        ) : null}
        <Text
          style={{
            ...textRole(pairing, "label"),
            color: cash ? colors.accent : colors.inkDim,
          }}
        >
          {initial}
        </Text>
      </View>
      <View style={styles.text}>
        <Text style={{ ...textRole(pairing, "body"), color: colors.ink }}>
          {account.name}
        </Text>
        <Text
          style={{
            fontFamily: FONT_PAIRINGS[pairing].body[500],
            fontSize: fontSize.meta,
            color: colors.inkMuted,
          }}
        >
          {sub}
        </Text>
      </View>
      <AccountBalanceBlock
        account={account}
        balance={balance}
        homeCurrency={homeCurrency}
        compact
      />
      <View
        style={[styles.chevron, { borderColor: colors.inkSoft3 }]}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

export interface AccountsCardProps {
  accounts: readonly AccountRow[];
  balances: ReadonlyMap<string, AccountBalanceView>;
  homeCurrency: string;
  loading: boolean;
}

export function AccountsCard({
  accounts,
  balances,
  homeCurrency,
  loading,
}: AccountsCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  if (!loading && accounts.length === 0) return null;

  const shown = accounts.slice(0, HOME_ACCOUNTS_CAP);
  return (
    <View
      style={[
        styles.cardOuter,
        { backgroundColor: colors.surface },
        shadows.card,
      ]}
    >
      <View style={styles.cardInner}>
        <Text
          accessibilityRole="header"
          style={{
            ...textRole(pairing, "label"),
            color: colors.inkMuted,
            ...styles.heading,
          }}
        >
          {t("home.accounts.heading")}
        </Text>
        {loading ? (
          <View
            accessible
            accessibilityLabel={t("home.loading")}
            accessibilityState={{ busy: true }}
          >
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.row}>
                <View
                  style={[styles.tile, { backgroundColor: colors.line4 }]}
                />
                <View
                  style={[
                    styles.placeholderLine,
                    { backgroundColor: colors.line4 },
                  ]}
                />
              </View>
            ))}
          </View>
        ) : (
          shown.map((a, i) => (
            <AccountTile
              key={a.id}
              account={a}
              balance={balances.get(a.id)}
              homeCurrency={homeCurrency}
              first={i === 0}
            />
          ))
        )}
        {!loading && accounts.length > HOME_ACCOUNTS_CAP ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => pushOnce("/accounts" as Href)}
            style={({ pressed }) => [
              styles.seeAll,
              { borderTopColor: colors.fill2 },
              pressed ? { opacity: PRESSED_OPACITY } : null,
            ]}
          >
            <Text style={{ ...textRole(pairing, "label"), color: colors.ink }}>
              {t("home.accounts.seeAll")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // M1: the shadow lives on the outer view (iOS drops a shadow on an overflow-hidden view); the
  // inner view clips the rows to the corner radius.
  cardOuter: {
    marginHorizontal: space.cardPad,
    marginTop: space.cardPad,
    borderRadius: radii.card,
  },
  cardInner: {
    borderRadius: radii.card,
    overflow: "hidden",
    paddingBottom: space.gapSm,
  },
  heading: {
    paddingTop: HEADING_PAD_TOP,
    paddingHorizontal: space.cardPadLg,
    paddingBottom: HEADING_PAD_BOTTOM,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: ROW_GAP,
    minHeight: space.touchMin,
    paddingVertical: space.rowPadDense,
    paddingHorizontal: space.cardPadLg,
  },
  tile: {
    width: size.homeAccountTile,
    height: size.homeAccountTile,
    borderRadius: radii.glyphTile,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, minWidth: 0 },
  placeholderLine: {
    flex: 1,
    height: space.cardPad,
    borderRadius: radii.glyphTile,
  },
  chevron: {
    width: CHEVRON,
    height: CHEVRON,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
    transform: [{ rotate: "45deg" }],
  },
  seeAll: {
    minHeight: space.touchMin,
    justifyContent: "center",
    paddingHorizontal: space.cardPadLg,
    borderTopWidth: 1,
  },
});
