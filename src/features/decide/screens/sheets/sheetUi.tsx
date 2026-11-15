// 06.1-15: the two small pieces the input sheets share: a field label and a filled text box (fill6, card pad, 44 high).
// 05.5-17: they now live in the shared forms folder (src/features/record/forms/formFields.tsx); re-exported so Decide imports keep working.
export { Field, FieldLabel, Note } from '@/features/record/forms/formFields';
export type { FieldProps } from '@/features/record/forms/formFields';
