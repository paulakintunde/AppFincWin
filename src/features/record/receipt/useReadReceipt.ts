// 10.1-24 (SCN-01, SCN-02; D-10 as amended by D-18): reads the receipt on the phone, page by page, and parses the pages as one
// receipt (each page stacked below the one before it). There is no online path. A page the phone cannot read is skipped; if no
// page reads, the outcome is unreadable and the review opens with the photo and empty rows. Nothing is logged (T-10.1-02-02).
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseReceipt } from '@/engine/receipt';
import type { ParseOptions, ParseOutcome, ReceiptOcr, ReceiptOcrLine } from '@/engine/receipt';
import { readOnDevice } from '@/services/receipts/readOnDevice';
import type { ReadResult } from '@/services/receipts/types';
import type { PageOffset } from './scanModel';

export interface PageSize {
  width: number | null;
  height: number | null;
}

export interface ReadReceiptState {
  state: 'reading' | 'done' | 'stopped';
  /** 1-based page being read. */
  page: number;
  pageCount: number;
  outcome: ParseOutcome | null;
  pageOffsets: PageOffset[];
  pageSizes: PageSize[];
  stop(): void;
}

/** Stacks the pages that read into one reading: page k's frames move down by the heights of the pages before it. */
export function mergePages(pages: readonly (ReadResult | null)[]): { ocr: ReceiptOcr | null; offsets: PageOffset[]; sizes: PageSize[] } {
  const lines: ReceiptOcrLine[] = [];
  const offsets: PageOffset[] = [];
  const sizes: PageSize[] = [];
  let top = 0;
  let width: number | null = null;
  pages.forEach((r, page) => {
    if (r === null || !r.ok) {
      sizes.push({ width: null, height: null });
      return;
    }
    const res = r.result;
    sizes.push({ width: res.imageWidth, height: res.imageHeight });
    offsets.push({ page, top });
    let bottom = 0;
    for (const l of res.lines) {
      const f = l.frame;
      if (f) bottom = Math.max(bottom, f.top + f.height);
      lines.push({ text: l.text, frame: f ? { left: f.left, top: f.top + top, width: f.width, height: f.height } : null });
    }
    if (res.imageWidth !== null) width = Math.max(width ?? 0, res.imageWidth);
    top += res.imageHeight ?? bottom;
  });
  if (offsets.length === 0) return { ocr: null, offsets, sizes };
  return { ocr: { lines, imageWidth: width, imageHeight: top > 0 ? top : null }, offsets, sizes };
}

function unreadable(currency: string): ParseOutcome {
  return {
    readable: false,
    receipt: {
      store: { value: null, unsure: true },
      date: { value: null, unsure: true },
      total: { value: null, unsure: true },
      items: [],
      extras: [],
      currency,
    },
  };
}

export function useReadReceipt(
  images: readonly { uri: string }[],
  opts: ParseOptions,
  read: (uri: string) => Promise<ReadResult> = readOnDevice,
): ReadReceiptState {
  const [state, setState] = useState<ReadReceiptState['state']>('reading');
  const [page, setPage] = useState(1);
  const [outcome, setOutcome] = useState<ParseOutcome | null>(null);
  const [pageOffsets, setOffsets] = useState<PageOffset[]>([]);
  const [pageSizes, setSizes] = useState<PageSize[]>([]);
  const stopped = useRef(false);
  // The reading runs once per sheet; later prop identity changes do not restart it.
  const first = useRef({ images, opts, read });

  useEffect(() => {
    const { images: list, opts: o, read: readPage } = first.current;
    let gone = false;
    void (async () => {
      const results: (ReadResult | null)[] = [];
      for (let i = 0; i < list.length; i++) {
        if (stopped.current || gone) return;
        setPage(i + 1);
        let r: ReadResult | null;
        try {
          r = await readPage((list[i] as { uri: string }).uri);
        } catch {
          r = null;
        }
        results.push(r);
      }
      if (stopped.current || gone) return;
      const merged = mergePages(results);
      const out = merged.ocr === null ? unreadable(o.currency) : parseReceipt(merged.ocr, o);
      setOffsets(merged.offsets);
      setSizes(merged.sizes);
      setOutcome(out);
      setState('done');
    })();
    return () => {
      gone = true;
    };
  }, []);

  const stop = useCallback(() => {
    stopped.current = true;
    setState('stopped');
  }, []);

  return { state, page, pageCount: images.length, outcome, pageOffsets, pageSizes, stop };
}
