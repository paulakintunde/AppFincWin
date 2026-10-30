// 05.3: part A of decide.v3.ui (05.3-09): home, notReady, check, band, layers, question, answer, factRow, confidence, ask.
import { answer } from './answer';
import { ask } from './ask';
import { band } from './band';
import { check } from './check';
import { confidence } from './confidence';
import { factRow } from './factRow';
import { home } from './home';
import { layers } from './layers';
import { notReady } from './notReady';
import { question } from './question';
export const partA = { home, notReady, check, band, layers, question, answer, factRow, confidence, ask } as const;
