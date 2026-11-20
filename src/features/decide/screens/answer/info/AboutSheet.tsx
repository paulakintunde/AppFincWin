// 06.1-35 (CO-D-64 (3), CMP-F04): "About this answer". "For this answer" lists every caveat on the result, then the fixed copy in
// ABOUT_KEYS order; "Money help at no cost" shows only when FREE_HELP has the country. Also opens with no result (settings).
import React from 'react';
import { useT } from '@/i18n';
import { ABOUT_KEYS, freeHelpFor, type Result, type StageReading } from '@/engine/decide/v3';
import { Block, Body, InfoSheet, SectionTitle } from './infoUi';
import { useSaidCaveats, type UseSaidOptions } from '../useSaid';

export interface AboutSheetProps {
  result?: Result | null;
  /** 08.1-20: the stage of the answer; its rows show under "For this answer" (the stage row only below 3 months). */
  stage?: StageReading | null;
  country: string | null;
  said: Pick<UseSaidOptions, 'currency' | 'today'>;
  /** The records date the "What it uses" line names. */
  recordsUpTo?: string | null;
  onClose: () => void;
}

/** The held-back row for the exact set of parts still waiting: all three, only what could move the answer, or only the two pay parts. */
function heldBackKey(parts: StageReading['heldBackParts']): string | null {
  const has = (p: StageReading['heldBackParts'][number]): boolean => parts.includes(p);
  if (has('answer_range') && has('pay_swings') && has('history_pay')) return 'decide.screens.stage.about.heldBack.all';
  if (has('answer_range') && !has('pay_swings') && !has('history_pay')) return 'decide.screens.stage.about.heldBack.answerRange';
  if (!has('answer_range') && has('pay_swings') && has('history_pay')) return 'decide.screens.stage.about.heldBack.pay';
  return null;
}

export function AboutSheet({ result = null, stage = null, country, said, recordsUpTo = null, onClose }: AboutSheetProps) {
  const t = useT();
  const tt = t as unknown as (key: string, values?: Record<string, string>) => string;
  const caveats = useSaidCaveats(result, said);
  const help = freeHelpFor(country);
  const stageRow = stage === null || stage.stage === 'deeper' ? null : tt(`decide.screens.stage.about.stageRow.${stage.stage}`);
  const heldBackRow = stage === null ? null : heldBackKey(stage.heldBackParts);
  const hasFor = caveats.length > 0 || stageRow !== null || heldBackRow !== null;
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
      {hasFor ? (
        <Block>
          <SectionTitle>{tt(ABOUT_KEYS.forThisTitle)}</SectionTitle>
          {caveats.map((c, i) => (
            <Body key={`${c.key}-${i}`} testID="about-caveat">
              {c.text}
            </Body>
          ))}
          {stageRow !== null ? <Body testID="about-stage">{stageRow}</Body> : null}
          {heldBackRow !== null ? <Body testID="about-held-back">{tt(heldBackRow)}</Body> : null}
        </Block>
      ) : null}
      <Block>
        <SectionTitle>{tt('decide.screens.stage.about.howFarTitle')}</SectionTitle>
        <Body testID="about-how-far-ahead">{tt('decide.screens.stage.about.howFar')}</Body>
      </Block>
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
