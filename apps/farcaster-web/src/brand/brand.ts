/**
 * SmashCast brand tokens.
 *
 * Swap the mark by replacing the SVGs in `public/brand/` and the React
 * components in this folder. Color values here match `src/brand/smashcast.css`
 * and the brand scale in `tailwind.config.js`.
 */
export const APP_NAME = 'SmashCast';

export const APP_DESCRIPTION =
  'SmashCast is a client for the Farcaster protocol.';

/** Filled buttons. White text on this red is about 5:1. */
export const BRAND_RED = '#E10600';

/** Dark-mode links and highlights. About 6:1 on #0A0A0A. */
export const BRAND_RED_ON_DARK = '#FF4D42';

export const BRAND_RED_HOVER = '#B40500';

export const BRAND_BLACK = '#0A0A0A';

/**
 * Document titles that name this client. Protocol phrases such as
 * "Sign in with Farcaster" are left alone.
 */
export function clientDocumentTitle(title: string): string {
  if (title === 'Farcaster') {
    return APP_NAME;
  }
  if (title === 'Farcaster Support') {
    return `${APP_NAME} Support`;
  }
  if (title.startsWith('Farcaster / ')) {
    return `${APP_NAME} / ${title.slice('Farcaster / '.length)}`;
  }
  if (title.endsWith(' / Farcaster')) {
    return `${title.slice(0, -' / Farcaster'.length)} / ${APP_NAME}`;
  }
  if (title.endsWith(' on Farcaster')) {
    return `${title.slice(0, -' on Farcaster'.length)} on ${APP_NAME}`;
  }
  return title;
}
