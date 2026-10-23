/**
 * The colour literals in the codebase.
 *
 * Every one of these exists because something is configured in JavaScript
 * rather than CSS and therefore cannot read a custom property. Each must stay
 * identical to its token in app/globals.css. Nothing else anywhere may hold a
 * colour value — see CLAUDE.md.
 */

/**
 * `themeColor` paints browser chrome *outside* the document, so it cannot read
 * a CSS custom property. Identical to --surface-base, the dark forest
 * background — see the 1.3 surfaces in app/globals.css.
 */
export const THEME_COLOR_INK = "#101710";

/**
 * Privy's login modal.
 *
 * Its appearance is passed as a config object of hex strings, which the SDK
 * uses to derive a whole palette internally — so it cannot be handed a
 * `var(--accent)`. Left unset, the modal renders in Privy's default light
 * theme, which is a white sheet over Ink. These two keep it in the brand.
 *
 * `theme` is --surface-base. `accent` is --accent (#d2dc76), the same
 * lime the send button and active borders use.
 */
export const PRIVY_MODAL_THEME = THEME_COLOR_INK;
export const PRIVY_MODAL_ACCENT = "#d2dc76";
