import { minorUnits } from '@/engine/money';
import type { MonthModel } from '@/engine/decide/v3';

const mu = minorUnits;

/** A MonthModel that keeps the engine identity: moneyOut = sum of parts, monthLeft = moneyIn - moneyOut. */
export function monthOf(p: { moneyIn: number; billsPaid: number; billsDue: number; everydayLogged: number; erest: number; setAside: number }): MonthModel {
  const moneyOut = p.billsPaid + p.billsDue + p.everydayLogged + p.erest + p.setAside;
  return {
    moneyIn: mu(p.moneyIn),
    moneyOut: mu(moneyOut),
    billsPaid: mu(p.billsPaid),
    billsDue: mu(p.billsDue),
    everydayLogged: mu(p.everydayLogged),
    erest: mu(p.erest),
    setAside: mu(p.setAside),
    monthLeft: mu(p.moneyIn - moneyOut),
  } as unknown as MonthModel;
}

// Sam, October day 18: in 4,000; paid 1,500 + everyday 1,205; due 500, rest of everyday 270, set aside 100.
export const SAM_PARTS = { moneyIn: 400000, billsPaid: 150000, everydayLogged: 120500, billsDue: 50000, erest: 27000, setAside: 10000 };
