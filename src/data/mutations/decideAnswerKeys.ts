// 05.2-17 (D-13): pure key builders for decide_answers. Each validates with the same patterns as the
// decide_answers_shape check in the 20261028001000 migration, so a key built here always satisfies the database.
const UUID_LIKE = /^[0-9a-f-]{36}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

function requireUuid(value: string, what: string): string {
  if (!UUID_LIKE.test(value)) throw new RangeError(`${what}: expected a 36 character id`);
  return value;
}

/** `<series id>:<YYYY-MM-DD>` for the pay_arrival answer of one pay date. */
export function payArrivalKey(seriesId: string, payDate: string): string {
  requireUuid(seriesId, 'payArrivalKey');
  if (!DATE.test(payDate)) throw new RangeError('payArrivalKey: payDate must be YYYY-MM-DD');
  return `${seriesId}:${payDate}`;
}

/** `YYYY-MM` for the expected_income answer of one month. */
export function expectedIncomeKey(month: string): string {
  if (!MONTH.test(month)) throw new RangeError('expectedIncomeKey: month must be YYYY-MM');
  return month;
}

/** The check id itself, for held_bridge and volatile_cover. */
export function checkAnswerKey(checkId: string): string {
  return requireUuid(checkId, 'checkAnswerKey');
}
