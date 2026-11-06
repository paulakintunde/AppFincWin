/**
 * The failed-saves list opened from the sync status line. One row per parked write (D-19): what it was, when, and why,
 * each with Dismiss, plus Dismiss all behind a confirm sheet. The attempted payload stays on the device; only its own
 * name or title (when it has one) is shown here.
 */
import React, { useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/ui/Text";
import { Sheet, SheetScroll } from "@/ui/Sheet";
import { SheetHeader } from "@/ui/SheetHeader";
import { ConfirmSheet } from "@/ui/ConfirmSheet";
import { Pill } from "@/ui/Pill";
import {
  recoverableCheckCreate,
  useRetryCheckCreate,
} from "@/data/mutations/decideChecks";
import {
  dismissFailedWrite,
  getFailedWrites,
  subscribeFailedWrites,
  type FailedWrite,
} from "@/data/sync/failedWrites";
import { useShouldStack } from "./textFit";
import { useT } from "@/i18n";
import { useDeviceLocale } from "@/services/locale/deviceLocale";
import { clockText } from "./clockText";
import { useTheme } from "@/theme/ThemeProvider";
import { radii, space } from "@/theme/layout";
import { fontSize, textRole } from "@/theme/typography";
import {
  failedEntityKey,
  failedReasonKey,
  failedWriteName,
} from "./failedWriteLabels";

function whenText(at: string, locale: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(d);
  const time = clockText({ hours: d.getHours(), minutes: d.getMinutes() }, locale);
  return `${date}, ${time}`;
}

export function FailedWritesSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const { locale } = useDeviceLocale();
  const { colors, pairing } = useTheme();
  const entries = useSyncExternalStore(subscribeFailedWrites, getFailedWrites);
  const [confirmAll, setConfirmAll] = useState(false);
  const { retry } = useRetryCheckCreate();
  const stacked = useShouldStack();

  const whatOf = (entry: FailedWrite): string => {
    const what = t(failedEntityKey(entry.entity));
    const name = failedWriteName(entry.attempted);
    return name === null ? what : t("sync.failedSheet.named", { what, name });
  };

  const dismissAll = () => {
    setConfirmAll(false);
    for (const entry of entries) void dismissFailedWrite(entry.id);
  };

  const body = { ...textRole(pairing, "body"), color: colors.ink };
  const meta = {
    ...textRole(pairing, "label"),
    fontSize: fontSize.meta,
    color: colors.inkMuted,
  };

  return (
    <>
      <Sheet
        visible={visible}
        onDismiss={onClose}
        accessibilityLabel={t("sync.failedSheet.title")}
      >
        <SheetHeader
          title={t("sync.failedSheet.title")}
          cancelLabel={t("sync.failedSheet.close")}
          onCancel={onClose}
        />
        <SheetScroll>
          <View style={styles.list}>
            {entries.length === 0 ? (
              <Text style={meta}>{t("sync.failedSheet.empty")}</Text>
            ) : null}
            {entries.map((entry) => {
              const what = whatOf(entry);
              return (
                <View
                  key={entry.id}
                  testID={`failed-write-${entry.id}`}
                  style={[
                    stacked ? styles.rowStacked : styles.row,
                    { backgroundColor: colors.fill1 },
                  ]}
                >
                  <View style={styles.text}>
                    <Text style={{ ...body, fontWeight: "600" }}>{what}</Text>
                    <Text style={meta}>{whenText(entry.at, locale)}</Text>
                    <Text style={body}>{t(failedReasonKey(entry))}</Text>
                  </View>
                  <View style={stacked ? styles.actionsStacked : styles.actions}>
                    {recoverableCheckCreate(entry) !== null ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("sync.failedSheet.tryAgainA11y", {
                          what,
                        })}
                        onPress={() => retry(entry)}
                        style={styles.dismiss}
                      >
                        <Text
                          style={{
                            ...textRole(pairing, "label"),
                            color: colors.accent,
                          }}
                        >
                          {t("sync.failedSheet.tryAgain")}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("sync.failedSheet.dismissA11y", {
                        what,
                      })}
                      onPress={() => void dismissFailedWrite(entry.id)}
                      style={styles.dismiss}
                    >
                      <Text
                        style={{
                          ...textRole(pairing, "label"),
                          color: colors.inkMuted,
                        }}
                      >
                        {t("sync.failedSheet.dismiss")}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
            {entries.length > 1 ? (
              <Pill
                label={t("sync.failedSheet.dismissAll")}
                variant="danger"
                onPress={() => setConfirmAll(true)}
              />
            ) : null}
          </View>
        </SheetScroll>
      </Sheet>
      <ConfirmSheet
        visible={confirmAll}
        title={t("sync.failedSheet.dismissAllTitle")}
        body={t("sync.failedSheet.dismissAllBody", { count: entries.length })}
        cancelLabel={t("sync.failedSheet.cancel")}
        confirmLabel={t("sync.failedSheet.dismissAll")}
        destructive
        onConfirm={dismissAll}
        onCancel={() => setConfirmAll(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.gapMd },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    padding: space.cardPad,
    borderRadius: radii.card,
  },
  rowStacked: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: space.gapSm,
    padding: space.cardPad,
    borderRadius: radii.card,
  },
  text: { flexShrink: 1, flexGrow: 1, minWidth: 0, gap: 2 },
  actionsStacked: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapSm,
    alignItems: "center",
  },
  actions: { alignItems: "flex-end" },
  dismiss: {
    minHeight: space.touchMin,
    minWidth: space.touchMin,
    justifyContent: "center",
    alignItems: "center",
  },
});
