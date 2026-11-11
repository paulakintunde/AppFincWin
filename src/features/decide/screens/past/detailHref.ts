import type { Href } from 'expo-router';

/** The route of one past decision (D48). */
export const DETAIL_HREF = (id: string): Href => `/decide/past/${id}` as Href;
