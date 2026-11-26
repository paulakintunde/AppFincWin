# Receipt corpus fixtures

Each `rNN.json` is the on-device OCR text of one real paper receipt: `{ name, module, ocr, expected }`.

- Made on the Pixel 9 by the dev reader (10.1-02) from the owner's private photos in `C:/dev/fincwin-private/receipts-corpus`. The photos are never committed.
- Scrubbed by `scripts/receipts/scrub-ocr-dump.mjs` (long digit runs, emails and phone numbers masked).
- `expected` is null until plan 10.1-15 labels each receipt. The scrub script never overwrites a labelled fixture.
- OCR module used: not yet recorded (set after the device check in 10.1-08 Task 4).
