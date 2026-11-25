// 10.1-07: UI-SPEC Copywriting Contract (approved 2026-11-24), minus the online-reading keys removed by D-18.
export const receipt = {
  row: {
    label: 'Receipt',
    none: 'None',
    files: '{{count}} files',
    waiting: 'Waiting to upload',
  },
  sheet: { title: 'Receipt' },
  photo: { label: 'Take a photo', sub: 'Opens the camera' },
  file: { label: 'Choose from files', sub: 'Image or PDF' },
  scan: { label: 'Scan a document', sub: 'Multi-page, straightened automatically' },
  read: {
    label: 'Read this receipt',
    sub: 'Fills in the items and the total. Nothing is saved until you confirm.',
  },
  removeAll: {
    label: 'Remove all',
    sub: 'Leaves the line without any',
    confirm: 'Remove all {{count}} receipts from this line? They are deleted for good.',
    keep: 'Keep them',
  },
  removeOne: {
    confirm: 'Remove this receipt? It is deleted for good.',
    keep: 'Keep it',
    confirmButton: 'Remove',
  },
  visible: {
    shared: 'Everyone this line is shared with can open these receipts. No one else can.',
    private: 'Only you can see these receipts.',
  },
  retention: {
    label: 'Receipts stay with the line until you remove them or delete the line.',
    export: 'They are included when you export your data.',
  },
  limits: 'Up to {{max}} files per line, {{size}} MB each.',
  tooBig: 'That file is too big. Up to {{size}} MB.',
  badType: 'That file type isn’t supported. Use an image or a PDF.',
  waiting: 'Receipt waiting to upload',
  waitingShort: 'Waiting',
  uploadFailed: {
    label: 'Didn’t upload',
    body: 'The file is still on your phone.',
  },
  camera: {
    off: 'Camera access is off',
    body: 'FincWin needs the camera to take a receipt photo. You can still choose a file.',
  },
  photos: {
    off: 'Photo access is off',
    body: 'FincWin needs access to your photos to pick a receipt. You can still choose a file.',
  },
  openSettings: 'Open settings',
  viewer: {
    counter: '{{n}} of {{count}}',
    openFailed: {
      label: 'This file did not open.',
      body: 'Your records are safe.',
    },
    previous: 'Previous',
    next: 'Next',
    close: 'Close',
    remove: 'Remove',
    retry: 'Try again',
  },
  delete: { note: 'Its receipts are deleted too.' },
  offlineSaved: 'Receipt saved on your phone. It will upload when you are back online.',
  loading: { a11y: 'Preparing the receipt' },
  thumb: {
    a11y: 'Receipt {{n}} of {{count}}, {{kind}}',
    waiting: { a11y: 'waiting to upload' },
  },
  kind: { photo: 'photo', file: 'file', scan: 'scan', pdf: 'PDF' },
  pages: '{{count}} pages',
  tooManyFiles: 'This line already has {{max}} receipts. Remove one to add another.',
  export: {
    title: 'Receipt files',
    body: 'Photos and PDFs attached to your lines, in ZIP files with a list that matches each file to its line.',
    button: 'Save receipt files',
    none: 'You have no receipts to export.',
    partial: '{{missing}} files could not be fetched. The list shows which.',
  },
} as const;
