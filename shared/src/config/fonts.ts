import { z } from 'zod';
import { CONFIG_SCHEMA_VERSION } from '../versions.js';

/**
 * A font file the operator uploaded.
 *
 * Broadcast graphics are branded, and a tournament's typeface is rarely one of the handful we could
 * reasonably ship. The built-in choices stay for anyone who does not care; this is for anyone who
 * does.
 */
export const customFontSchema = z.object({
  /**
   * The CSS family name, and the value stored in an overlay's `fontFamily`.
   *
   * Derived from the uploaded file name and made unique, so it is stable: an overlay referencing
   * it must keep working when another font is added later.
   */
  family: z.string().min(1).max(60),
  /** File on disk, inside the data directory's `fonts` folder. */
  fileName: z.string().min(1),
  /** Path the browser requests, carrying a version so a replaced file is not served from cache. */
  url: z.string().min(1),
  /** What the operator uploaded, shown in the admin so they can recognise it. */
  originalName: z.string().min(1),
});
export type CustomFont = z.infer<typeof customFontSchema>;

export const customFontsDocumentSchema = z.object({
  schemaVersion: z.number().int().min(1),
  fonts: z.array(customFontSchema),
});
export type CustomFontsDocument = z.infer<typeof customFontsDocumentSchema>;

export const DEFAULT_CUSTOM_FONTS: CustomFontsDocument = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  fonts: [],
};

/** The CSS value stored on an overlay. The fallback matters if the font file ever goes missing. */
export function fontFamilyValue(family: string): string {
  return `'${family}', system-ui, sans-serif`;
}
