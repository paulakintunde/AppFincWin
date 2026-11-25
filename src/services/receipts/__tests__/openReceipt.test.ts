import { SIGNED_URL_SECONDS, openPdf, signedUrlFor, type OpenReceiptDeps } from '../openReceipt';

jest.mock('../upload', () => ({ RECEIPT_BUCKET: 'receipts' }));

function deps(over: Partial<OpenReceiptDeps> = {}): OpenReceiptDeps {
  return {
    sign: jest.fn().mockResolvedValue('https://signed.example/x'),
    download: jest.fn().mockResolvedValue('file:///cache/receipt-view/receipt.pdf'),
    share: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('10.1-17 openReceipt', () => {
  it('signs for 60 seconds and returns the link, or null on error', async () => {
    const d = deps();
    expect(SIGNED_URL_SECONDS).toBe(60);
    expect(await signedUrlFor('h/t/r.jpg', d)).toBe('https://signed.example/x');
    expect(d.sign).toHaveBeenCalledWith('h/t/r.jpg', 60);
    expect(await signedUrlFor('p', deps({ sign: jest.fn().mockRejectedValue(new Error('x')) }))).toBeNull();
    expect(await signedUrlFor('p', deps({ sign: jest.fn().mockResolvedValue(null) }))).toBeNull();
  });

  it('opens a PDF in the system viewer and removes the previous temp file on the next call', async () => {
    const d = deps();
    expect(await openPdf('h/t/r.pdf', d)).toBe('opened');
    expect(d.share).toHaveBeenCalledWith('file:///cache/receipt-view/receipt.pdf');
    expect(d.remove).not.toHaveBeenCalled();
    expect(await openPdf('h/t/r.pdf', d)).toBe('opened');
    expect(d.remove).toHaveBeenCalledWith('file:///cache/receipt-view/receipt.pdf');
  });

  it('returns failed on any error', async () => {
    expect(await openPdf('p', deps({ sign: jest.fn().mockResolvedValue(null) }))).toBe('failed');
    expect(await openPdf('p', deps({ download: jest.fn().mockRejectedValue(new Error('x')) }))).toBe('failed');
    expect(await openPdf('p', deps({ share: jest.fn().mockRejectedValue(new Error('x')) }))).toBe('failed');
  });
});
