// 10.1-02: shared shapes for receipt capture, preparation and on-device reading.
export type ReceiptMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
export type ReceiptKind = 'photo' | 'file' | 'scan';
export interface LocalReceiptFile {
  uri: string;
  mime: ReceiptMime;
  ext: 'jpg' | 'png' | 'webp' | 'pdf';
  bytes: number;
  width: number | null;
  height: number | null;
}
export type PickResult =
  | { ok: true; kind: ReceiptKind; files: LocalReceiptFile[] } // scan: one file per page, in page order
  | { ok: false; reason: 'cancelled' | 'permission_denied' | 'too_big' | 'bad_type' | 'unavailable' | 'failed' };
export interface OcrFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface OcrLine {
  text: string;
  frame: OcrFrame | null; // null when the module returns text only
}
export interface OcrResult {
  lines: OcrLine[];
  imageWidth: number | null;
  imageHeight: number | null;
}
export type ReadResult = { ok: true; result: OcrResult } | { ok: false; reason: 'unavailable' | 'failed' | 'empty' };
