/**
 * What this product is called, in one place.
 *
 * The name was previously a bare string literal in the top bar, a different
 * one in the sign-in card, and a third in index.html's <title>. Renaming the
 * product meant finding all three and hoping there was not a fourth. Everything
 * that displays the name now reads it from here, including the document title
 * (set from main.tsx -- index.html carries only a pre-hydration placeholder).
 *
 * `APP_NAME` is deliberately the short wordmark for the navy bar; `APP_TITLE`
 * is what a browser tab and a sign-in card want, which is the same name plus
 * enough context to identify the window among twenty others.
 */

/** The wordmark, as shown on the navy bar. */
export const APP_NAME = 'CHARTERING'

/** Sentence-case form, for prose and headings that are not the wordmark. */
export const APP_NAME_TITLE_CASE = 'Chartering Desk'

/** Browser tab / window title. */
export const APP_TITLE = 'Chartering Desk: SAIL dry-bulk voyage pricing'

/** One line on what the desk is, for the sign-in card and Help. */
export const APP_TAGLINE = 'Dry-bulk chartering decision support for SAIL raw materials'
