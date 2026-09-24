// D-14: an optimistic row applied to the cache before the server has confirmed it carries
// `pending: true` so Record's UI can render it distinctly; a row that has already synced
// simply omits the flag rather than setting it to `false`.
export type WithPending<T> = T & { readonly pending?: boolean };
