// Account pending split. CONTEXT D-26 (pending set = every real pending row through the
// household horizon), ACT-17. BigInt-safe, overflow flagged rather than wrong.

export interface PendingSplit {
  comingIn: number | null;
  goingOut: number | null;
  after: number | null;
  overflow: boolean;
}

const INT_TEXT = /^-?\d+$/;

function toSafeNumber(n: bigint): number | null {
  if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return Number(n);
}

export function pendingSplit(input: {
  balance: number | null;
  pendingIn: string;
  pendingOut: string;
}): PendingSplit {
  if (!INT_TEXT.test(input.pendingIn) || !INT_TEXT.test(input.pendingOut)) {
    throw new RangeError('pending sums must be integer text');
  }
  const inBig = BigInt(input.pendingIn);
  const outBig = BigInt(input.pendingOut);
  if (inBig < BigInt(0)) throw new RangeError('pendingIn must be >= 0');
  if (outBig > BigInt(0)) throw new RangeError('pendingOut must be <= 0');

  const comingIn = toSafeNumber(inBig);
  const goingOut = toSafeNumber(-outBig);
  let after: number | null = null;
  if (input.balance !== null) {
    after = toSafeNumber(BigInt(input.balance) + inBig + outBig);
  }
  const overflow = comingIn === null || goingOut === null || after === null;
  return { comingIn, goingOut, after, overflow };
}
