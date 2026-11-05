/**
 * 05.4-37 APP-20: every Decide v3 copy key as a type. The engine cannot import this (CLAUDE.md: engine/ imports only engine/), so
 * its copy tables carry literal key types and src/i18n/__tests__/decideV3Keys.typecheck.ts holds each one against this union.
 */
import type en from './locales/en';

/** The dotted paths of every string leaf under T, each prefixed with P. */
type LeafPaths<T, P extends string> = {
  [K in keyof T & string]: T[K] extends string ? `${P}.${K}` : LeafPaths<T[K], `${P}.${K}`>;
}[keyof T & string];

type En = typeof en;

/** decide.v3.* and the D-64 / D-120 legal keys (legal.decideAnswer, legal.decideAbout, legal.decideIntro). */
export type DecideV3CopyKey = LeafPaths<En['decide']['v3'], 'decide.v3'> | LeafPaths<En['legal'], 'legal'>;
