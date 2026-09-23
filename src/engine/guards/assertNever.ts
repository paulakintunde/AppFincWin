/**
 * Exhaustive-switch helper. Call in the `default` branch of a switch over a
 * union type; TypeScript narrows `value` to `never` when every member of the
 * union has been handled in an earlier `case`, so a missing case becomes a
 * compile-time error here rather than a silent runtime fallthrough.
 */
export function assertNever(value: never, context = 'value'): never {
  throw new Error(`Unhandled ${context}: ${JSON.stringify(value)}`);
}
