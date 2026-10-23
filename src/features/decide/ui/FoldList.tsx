/**
 * D-74 / UI-SPEC R1 "FoldList": one white card of fold rows, one open at a time. Controlled: the screen keeps `openKey`
 * while the flow is open. Toggling announces the change (R7) and, once an opened body has laid out, reports the row's y
 * so the screen can scroll it into view. Only a fold the user opens scrolls; the default open on arrival does not.
 */
import React, { useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space, radii } from '@/theme/layout';
import { shadows } from '@/theme/tokens';
import { FoldRow, type FoldInfo } from './FoldRow';
import { useScrollIntoView } from './scrollIntoView';

export interface FoldSpec<K extends string = string> {
  key: K;
  title: string;
  preview: string;
  /** 05-106 (D-88): the preview is waiting on the settled figures. */
  busy?: boolean;
  info?: FoldInfo;
  body: React.ReactNode;
}

export interface FoldListProps<K extends string = string> {
  folds: readonly FoldSpec<K>[];
  openKey: K | null;
  onOpenChange: (key: K | null) => void;
  onOpened?: (key: K, rowY: number) => void;
}

export function FoldList<K extends string>({ folds, openKey, onOpenChange, onOpened }: FoldListProps<K>) {
  const t = useT();
  const { colors } = useTheme();
  const scrollIntoView = useScrollIntoView();
  const rowRefs = useRef(new Map<K, View>());
  const rowYs = useRef(new Map<K, number>());
  // The fold the user opened and whose body has not laid out yet. A fold open on arrival (the default) never scrolls: the screen
  // must stay at the top, on the verdict.
  const userOpened = useRef<K | null>(null);

  if (folds.length === 0) return null;

  const toggle = (fold: FoldSpec<K>) => {
    if (openKey === fold.key) {
      userOpened.current = null;
      onOpenChange(null);
      AccessibilityInfo.announceForAccessibility(t('decide.fold.a11y.collapsed', { title: fold.title }));
      return;
    }
    const previous = openKey === null ? undefined : folds.find((f) => f.key === openKey);
    userOpened.current = fold.key;
    onOpenChange(fold.key);
    AccessibilityInfo.announceForAccessibility(
      previous
        ? t('decide.fold.a11y.expandedCollapsed', { title: fold.title, previous: previous.title })
        : t('decide.fold.a11y.expanded', { title: fold.title }),
    );
  };

  return (
    <View style={[styles.card, shadows.card, { backgroundColor: colors.surface }]}>
      {folds.map((fold, index) => (
        <View
          key={fold.key}
          ref={(node) => {
            if (node) rowRefs.current.set(fold.key, node);
            else rowRefs.current.delete(fold.key);
          }}
          onLayout={(e) => rowYs.current.set(fold.key, e.nativeEvent.layout.y)}
          style={index > 0 ? [styles.separator, { borderTopColor: colors.fill2 }] : undefined}
        >
          <FoldRow
            title={fold.title}
            preview={fold.preview}
            busy={fold.busy}
            expanded={openKey === fold.key}
            onToggle={() => toggle(fold)}
            info={fold.info}
            onBodyLayout={() => {
              onOpened?.(fold.key, rowYs.current.get(fold.key) ?? 0);
              if (userOpened.current !== fold.key) return;
              userOpened.current = null;
              scrollIntoView(rowRefs.current.get(fold.key) ?? null);
            }}
          >
            {fold.body}
          </FoldRow>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    paddingHorizontal: space.cardPadLg,
  },
  separator: { borderTopWidth: 1 },
});
