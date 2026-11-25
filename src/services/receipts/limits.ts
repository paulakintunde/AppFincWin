// 10.1-02 (D-21): receipt limits. RECEIPT_MAX_BYTES matches the storage bucket file_size_limit.
export const RECEIPT_MAX_FILES_PER_LINE = 5; // a multi-page scan counts as one receipt
export const RECEIPT_MAX_PAGES_PER_SCAN = 10;
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_LONG_EDGE_PX = 2000;
export const RECEIPT_JPEG_QUALITY = 0.8;
