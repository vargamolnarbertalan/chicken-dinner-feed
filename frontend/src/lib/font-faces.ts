import type { CustomFont } from '@cdf/shared';

const STYLE_ELEMENT_ID = 'cdf-custom-fonts';

/** `url(...)` is CSS, so a quote or a bracket in the path would end the declaration early. */
function cssUrl(url: string): string {
  return url.replace(/["'()\\\s]/g, encodeURIComponent);
}

function cssString(value: string): string {
  return value.replace(/['\\]/g, '\\$&');
}

/**
 * Register the operator's uploaded fonts with the document.
 *
 * Injected as a stylesheet rather than loaded through the CSS Font Loading API because the overlay
 * only ever needs the family available to CSS, and a `<style>` element is trivially replaceable when
 * the list changes — which it does live, without a reload.
 *
 * `font-display: block` is deliberate. The alternative, `swap`, paints a fallback first and then
 * flips to the real font: on a broadcast that is a visible flicker of the wrong typeface. Blocking
 * briefly and appearing correct is the better trade when the audience is watching.
 */
export function applyCustomFontFaces(fonts: readonly CustomFont[]): void {
  let style = document.getElementById(STYLE_ELEMENT_ID);

  if (fonts.length === 0) {
    style?.remove();
    return;
  }

  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    document.head.appendChild(style);
  }

  style.textContent = fonts
    .map(
      (font) =>
        `@font-face { font-family: '${cssString(font.family)}'; src: url('${cssUrl(font.url)}'); font-display: block; }`,
    )
    .join('\n');
}
