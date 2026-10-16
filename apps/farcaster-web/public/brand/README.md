# SmashCast brand files

Replace these files to change the logo. The React components in `src/brand/SmashCastMark.tsx` draw the same mark in the app, so update that file too if the bolt changes.

| File | Use |
| --- | --- |
| `smashcast-mark.svg` | Source mark. Favicon and app icons are rasterized from this. |
| `smashcast-wordmark.svg` | Mark plus name, for light backgrounds. |
| `smashcast-wordmark-on-dark.svg` | Mark plus name, for black backgrounds. |
| `favicon.png` | Browser tab icon (32px). |
| `favicon-badge.png` | Tab icon when there are unseen notifications. |
| `apple-touch-icon.png` | Home-screen icon (180px). |
| `icon-192.png`, `icon-512.png`, `icon-1024.png` | Web app manifest icons. |

Colors live in `src/brand/brand.ts`, `src/brand/smashcast.css`, and the brand scale at the top of `tailwind.config.js` (the `violet` scale is the SmashCast red).
