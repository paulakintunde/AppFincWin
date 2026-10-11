/**
 * D-24: a PDF line whose figure sat in no labelled column, with no running balance to place it,
 * reads with no sign ('pdf-ambiguous-column', marker 'none') and so as money in by default. A
 * file with no running balances is then checked only end to end (opening + every amount =
 * closing), so that one guessed sign can fail every line in the file.
 *
 * When both ends are known and exactly one line's sign is open, the ends decide it: if the file
 * does not tie as read but does tie with that line the other way round, that line is the one to
 * turn. Nothing is turned when the file already ties, when more than one sign is open, or when
 * neither sign ties. The line keeps its issue, so it is still reviewed (D-23).
 * All sums use bigint so values near the 1e13 ceiling stay exact.
 */
export function signToTurn(
  amounts: readonly (number | null)[],
  signOpen: readonly boolean[],
  ends: { opening: number | null; closing: number | null }
): number | null {
  if (ends.opening === null || ends.closing === null) return null;
  const open: number[] = [];
  let sum = 0n;
  for (let i = 0; i < amounts.length; i += 1) {
    const amount = amounts[i];
    if (amount === null || amount === undefined) return null;
    sum += BigInt(amount);
    if (signOpen[i] === true && amount !== 0) open.push(i);
  }
  if (open.length !== 1) return null;
  const target = BigInt(ends.closing) - BigInt(ends.opening);
  if (sum === target) return null;
  const k = open[0] as number;
  return sum - 2n * BigInt(amounts[k] as number) === target ? k : null;
}
