/**
 * D-70: pairs an info button with its InfoSheet. The sheet mounts in the caller's tree so it stacks over a parent sheet;
 * on close, focus returns to the button that opened it. `aboutAction` / `onAccessibilityAction` let a fold row offer the
 * explanation as a screen-reader action instead of a second tap target.
 */
import React, { useCallback, useRef, useState } from 'react';
import type { AccessibilityActionEvent, View } from 'react-native';
import { useT } from '@/i18n';
import { focusAccessibility } from '@/shell/a11yFocus';
import { infoCopy, type InfoDynamic, type InfoKey } from '../copy/infoTerms';
import { refText, type Translate } from '../check/refText';
import { InfoButton, type InfoTone } from './InfoButton';
import { InfoSheet } from './InfoSheet';

export interface InfoSheetHandle {
  open: () => void;
  button: (tone?: InfoTone) => React.ReactNode;
  sheet: React.ReactNode;
  term: string;
  aboutAction: { name: 'about'; label: string };
  onAccessibilityAction: (e: AccessibilityActionEvent) => void;
}

export function useInfoSheet(infoKey: InfoKey, dynamic?: InfoDynamic): InfoSheetHandle {
  const t = useT() as Translate;
  const [visible, setVisible] = useState(false);
  const buttonRef = useRef<View>(null);
  const term = refText(t, infoCopy(infoKey, dynamic).term);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => {
    setVisible(false);
    focusAccessibility(buttonRef.current);
  }, []);

  return {
    open,
    button: (tone = 'light') => <InfoButton term={term} onPress={open} tone={tone} buttonRef={buttonRef} />,
    sheet: <InfoSheet visible={visible} infoKey={infoKey} dynamic={dynamic} onClose={close} />,
    term,
    aboutAction: { name: 'about', label: t('decide.infoButton.a11y', { term }) },
    onAccessibilityAction: (e) => {
      if (e.nativeEvent.actionName === 'about') open();
    },
  };
}
