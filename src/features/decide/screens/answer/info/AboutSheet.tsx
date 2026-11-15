// 06.1-35 (CO-D-64 (3), CMP-F04): "About this answer". "For this answer" lists every caveat on the result, then the fixed copy in
// ABOUT_KEYS order; "Money help at no cost" shows only when FREE_HELP has the country. Also opens with no result (settings).
import React from 'react';
import { useT } from '@/i18n';
import { ABOUT_KEYS, freeHelpFor, type Result } from '@/engine/decide/v3';
import { Block, Body, InfoSheet, SectionTitle } from './infoUi';
import { useSaidCaveats, type UseSaidOptions } from '../useSaid';

export interface AboutSheetProps {
  result?: Result | null;
  country: string | null;
  said: Pick<UseSaidOptions, 'currency' | 'today'>;
  /** The records date the "What it uses" line names. */
  recordsUpTo?: string | null;
  onClose: () => void;
}

export function AboutSheet({ result = null, country, said, recordsUpTo = null, onClose }: AboutSheetProps) {
  const t = useT();
  const tt = t as unknown as (key: string, values?: Record<string, string>) => string;
  const caveats = useSaidCaveats(result, said);
  const help = freeHelpFor(country);
  const section = (title: string, keys: readonly string[], values?: Record<string, string>) => (
    <Block key={title}>
      <SectionTitle>{tt(title)}</SectionTitle>
      {keys.map((k) => (
        <Body key={k}>{tt(k, values)}</Body>
      ))}
    </Block>
  );
  return (
    <InfoSheet title={tt(ABOUT_KEYS.title)} onClose={onClose}>
      {caveats.length > 0 ? (
        <Block>
          <SectionTitle>{tt(ABOUT_KEYS.forThisTitle)}</SectionTitle>
          {caveats.map((c, i) => (
            <Body key={`${c.key}-${i}`} testID="about-caveat">
              {c.text}
            </Body>
          ))}
        </Block>
      ) : null}
      {section(ABOUT_KEYS.usesTitle, ABOUT_KEYS.uses, { date: recordsUpTo ?? '' })}
      {section(ABOUT_KEYS.cantSeeTitle, ABOUT_KEYS.cantSee)}
      {section(ABOUT_KEYS.howFarTitle, ABOUT_KEYS.howFar)}
      {section(ABOUT_KEYS.whatTitle, ABOUT_KEYS.what)}
      {help !== null ? (
        <Block>
          <SectionTitle>{tt(ABOUT_KEYS.freeHelpTitle)}</SectionTitle>
          <Body testID="about-free-help">{tt(ABOUT_KEYS.freeHelp, { name: help.name })}</Body>
        </Block>
      ) : null}
    </InfoSheet>
  );
}
