// Byte caps for statement files. Constants only, so both the picker (services)
// and the pure import pipeline can use them without depending on each other.

// Phase 2 D-18: CSV and OFX files.
export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;

// Phase 02.1 D-07: PDF statements.
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
