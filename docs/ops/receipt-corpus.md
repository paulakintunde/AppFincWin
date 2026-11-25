# Receipt test set

FincWin will read paper receipts on your phone. To check that it reads real ones well, it needs a small test set of your own receipts. This page says what to collect and where to put it.

## Where to put the photos

Drop them in `C:/dev/fincwin-private/receipts-corpus/`. Create the folder if it is not there.

This folder is outside every FincWin code folder on purpose. The photos are never committed and never leave your computer.

## How many

20 to 30 photos.

## What to cover

Try to get a mix:

- grocery
- restaurant, with a tip
- pharmacy
- hardware
- at least two long receipts
- at least two faded ones
- at least one with a discount line
- at least one with a date like 03/04/26

## Before you drop them

Cover or crop these first:

- names
- card numbers
- loyalty numbers
- signatures

## File names and format

Name them `r01.jpg`, `r02.jpg`, up to `r30.jpg`. JPEG or PNG, taken with the phone camera. Do not edit them, other than covering what is listed above.

## What happens next

Plan 10.1-08 reads each photo on the Pixel 9 with the phone's own text reader and saves only the text. Before saving, it masks long digit runs, email addresses and phone numbers. The photos are never committed. The text files are committed under `src/engine/receipt/__tests__/fixtures/corpus/`.

When you are done, tell Claude "dropped N", where N is the number of photos.
