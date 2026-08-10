/**
 * Turn what an operator types into a valid overlay id.
 *
 * Ids end up in URLs — the browser-source address and the Companion button — so they are restricted
 * to lowercase letters, digits and hyphens. But nobody types that: they type "Szép tabella 2".
 * Asking them to hand-craft a URL-safe id and rejecting what they type is the wrong question, so we
 * derive it instead and show the result.
 *
 * Accents are stripped rather than dropped, so "Szép tabella" becomes "szep-tabella" and not
 * "sz-p-tabella".
 */
export function toInstanceId(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 32)
    .replace(/-+$/, '');
}
