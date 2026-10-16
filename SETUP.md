# Local web setup

How to run `apps/farcaster-web` against Farcaster's production API (`https://client.farcaster.xyz`). No API key or `.env` file is required for the web client.

## Versions

| Tool | Version |
| --- | --- |
| Node.js | `>= 20.19.4` (`package.json` `engines`). `.node-version` and `.tool-versions` pin **20.19.5**. Node **22.23.3** also works. |
| pnpm | **10.8.1** (`packageManager`). Do not upgrade when the installer offers a newer pnpm; the lockfile is for 10.8.1. |

Enable Corepack so `pnpm` matches the pin:

```bash
corepack enable
corepack prepare pnpm@10.8.1 --activate
node -v
pnpm -v
```

## Install and run

From the repo root, install the workspace and compile shared packages. `pnpm watch` stays running; it rebuilds those packages when their source changes.

```bash
pnpm install
pnpm watch
```

`pnpm watch` must build in dependency order. The web app (and `farcaster-client-hooks`) import `farcaster-analytics`, `farcaster-cryptography`, and `farcaster-cryptography-web` from their compiled `dist` output. Those packages are not committed. Watch builds them before `farcaster-client-hooks`.

In a second terminal:

```bash
cd apps/farcaster-web
pnpm install
pnpm start
```

The second `pnpm install` is what the root README lists. The root install already linked this workspace package, so it is usually a no-op.

Open **https://localhost:5173/**. `pnpm start` turns HTTPS on (`HTTPS=true`) and Vite serves a self-signed certificate (`@vitejs/plugin-basic-ssl`). The browser will warn. Proceed past that warning for local development.

Plain HTTP, still on port 5173:

```bash
cd apps/farcaster-web
HTTPS=false pnpm dev
```

`HTTPS` defaults to on unless it is the string `false`, including for `pnpm dev`.

## Environment variables

None are required to boot the web client.

| Variable | Required | Effect |
| --- | --- | --- |
| `HTTPS` | No | Anything other than `false` serves HTTPS. `pnpm start` sets it to `true`. |
| `VITE_RELEASE_ID` | No | Build-time label. Defaults to `dev` (`src/constants/env.ts`). |

Analytics keys in `packages/farcaster-analytics/src/config/analyticsConfig.ts` are the placeholder `REPLACE_ME`. The app still runs. The browser console will show a failed request to `https://ph.neynar.com/array/REPLACE_ME/config.js`. Replace those constants only if you want PostHog.

## What you should see

- `/` while logged out is the marketing landing page (Sign up, Log in with email, Log in with phone). The home feed is only rendered after sign-in.
- Public profiles such as `/dwr` load casts from the production API without an account.
- **Log in with phone** opens a QR code tied to a sync channel on the production API. Finishing login means scanning that code with the Farcaster mobile app (the link is `https://farcaster.xyz/login-web?channel-id=...`). This checkout does not include a way to mint that approval locally.
- **Log in with email** calls `initiateMagicLink` on the production API. You need an email that already belongs to a Farcaster account. The link in the email is issued for the production host, not `localhost`.

## Mobile

Not covered by the steps above. `apps/farcaster-mobile` is an Expo app and expects a Mac with Xcode, CocoaPods, and JDK 17. See `apps/farcaster-mobile/README.md` and `apps/farcaster-mobile/.env.example` (`EXPO_ACCESS_TOKEN`, `EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN`).
