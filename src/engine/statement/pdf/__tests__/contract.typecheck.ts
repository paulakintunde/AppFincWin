// Compile-time only (tsc --noEmit): the engine's copy of the PDF wire types must equal the Edge
// Function's. A drift in either file turns one of these assignments into a type error.
import type * as Engine from '../types';
import type * as Server from '../../../../../supabase/functions/read-pdf-statement/contract';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export const itemMatches: Equal<Server.PdfTextItem, Engine.PdfTextItem> = true;
export const pageMatches: Equal<Server.PdfPageText, Engine.PdfPageText> = true;
export const errorMatches: Equal<Server.PdfReadError, Engine.PdfReadError> = true;
export const responseMatches: Equal<Server.PdfReadResponse, Engine.PdfReadResponse> = true;
