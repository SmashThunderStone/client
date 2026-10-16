# Local web setup

How to run `apps/farcaster-web` against Farcaster's production API (`https://client.farcaster.xyz`). No API key or `.env` file is required for the web client.

## Versions

| Tool | Version |
| --- | --- |
| Node.js | **22.x**. `package.json` `engines.node` is `22.x` (Vercel uses this over the dashboard setting). `.node-version` is `22`. `.tool-versions` still lists asdf `nodejs 20.19.5`. pnpm is not engine-strict, so a local Node 20.19.5 install still proceeds. The production build was verified on Node **22.23.3**. |
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

`HTTPS` defaults to on for the dev server unless it is the string `false`, including for `pnpm dev`. `vite build` and `vite preview` do not load the self-signed certificate plugin.

## Environment variables

None are required to boot the web client.

| Variable | Required | Effect |
| --- | --- | --- |
| `HTTPS` | No | Anything other than `false` serves HTTPS on the **dev** server. `pnpm start` sets it to `true`. Ignored by `vite build` and `vite preview`. |
| `VITE_RELEASE_ID` | No | Build-time label. Defaults to `dev` (`src/constants/env.ts`). |
| `VITE_FC_API_BASE` | Production only | Same-origin API prefix. `apps/farcaster-web/.env.production` sets `/fc-api`. Unset during local dev, which keeps `https://farcaster.xyz/~api`. |
| `VITE_PROTOCOL_DIRECT` | No | Set to `1` to read profiles, casts, and follows from a Snapchain hub and to show wallet sign-in. Unset leaves QR login and the hosted API exactly as they are. |
| `VITE_SNAP_API_BASE` | No | Hub base URL. Defaults to `https://haatz.quilibrium.com`. Set to `/snap` to use the same-origin rewrite. |
| `VITE_WALLETCONNECT_PROJECT_ID` | For mobile wallet sign-in | Reown / WalletConnect Cloud project id. Browser injected wallets work without it. |

Analytics keys in `packages/farcaster-analytics/src/config/analyticsConfig.ts` are the placeholder `REPLACE_ME`. The app still runs. The browser console will show a failed request to `https://ph.neynar.com/array/REPLACE_ME/config.js`. Replace those constants only if you want PostHog.

## What you should see

- `/` while logged out is the marketing landing page (Sign up, Log in with email, Log in with phone). The home feed is only rendered after sign-in.
- Public profiles such as `/dwr` load casts from the production API without an account.
- **Log in with phone** opens a QR code tied to a sync channel on the production API. Finishing login means scanning that code with the Farcaster mobile app (the link is `https://farcaster.xyz/login-web?channel-id=...`). This checkout does not include a way to mint that approval locally.
- **Log in with email** calls `initiateMagicLink` on the production API. You need an email that already belongs to a Farcaster account. The link in the email is issued for the production host, not `localhost`.

## Production (Vercel, static)

Deploy branch: `cursor/smashcast-rebrand-8c3a`.

`https://client.farcaster.xyz` answers arbitrary origins with HTTP 200 and the JSON body, but it only sends `Access-Control-Allow-Origin` for an allowlist (`https://farcaster.xyz`, `https://warpcast.com`, `http://localhost:4173`, `https://localhost:5173`). A public Vercel hostname is not on that list, so the browser blocks the response. `vercel.json` rewrites `/fc-api/:path*` to `https://client.farcaster.xyz/:path*`. Production builds call that path (`VITE_FC_API_BASE=/fc-api`). The same endpoints do not reject the body based on `Origin` or `Referer`; they only omit the CORS header. WebSockets stay on `wss://ws.farcaster.xyz/stream` (a static rewrite cannot proxy that socket).

Project settings for the Vercel API (`POST /v11/projects`):

| Field | Value |
| --- | --- |
| Root directory | `null` (repository root, not `apps/farcaster-web`) |
| Framework | `null` (Other) |
| Node.js | `22.x` |
| Install command | `HUSKY=0 COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack enable && corepack prepare pnpm@10.8.1 --activate && pnpm install` |
| Build command | `pnpm build:web` |
| Output directory | `apps/farcaster-web/dist` |
| Env `VITE_FC_API_BASE` | `/fc-api` (Production and Preview). Also committed in `.env.production`. |

`pnpm build:web` compiles `farcaster-analytics`, `farcaster-cryptography`, `farcaster-cryptography-web`, `farcaster-client-data`, `farcaster-protocol`, and `farcaster-client-hooks` (in that order), then `vite build` for `farcaster-web`. It is not `pnpm watch`.

Deep links such as `/dwr` are rewritten to `/index.html` after the filesystem is checked, so hashed assets are still served as files.

Local check of that production bundle:

```bash
pnpm build:web
cd apps/farcaster-web
pnpm exec vite preview --host 127.0.0.1 --port 4173
```

Use `127.0.0.1`, not `localhost`. `localhost` is on the API's CORS allowlist, so a preview there would succeed even if the proxy were broken.

## Protocol-direct wallet sign-in

Off unless `VITE_PROTOCOL_DIRECT=1`. Details and the gasless vs onchain signer choice are in `packages/farcaster-protocol/README.md`.

Phone steps, once that flag and a WalletConnect project id are set on the Vercel build:

1. In Rainbow or MetaMask, import the Farcaster recovery phrase. Do this in the wallet, not in SmashCast.
2. Open SmashCast and tap **Sign in with wallet**, then **WalletConnect**.
3. Approve the connection in the wallet. The app looks up `IdRegistry.idOf` on Optimism. If the address does not own a FID, it stops with an error.
4. Tap **Approve signer**. Confirm the two signatures (signed key request, then key add). They are not transactions.
5. SmashCast submits a gasless `KEY_ADD` to the hub and waits until `signersByFid` lists the new key.
6. If that submit is rejected, tap **Register onchain instead**. Confirm the Optimism `KeyGateway.add` transaction. That one costs gas.

Sign out deletes the Ed25519 seed from this browser's IndexedDB.

Vercel settings that stay the same: root directory null, framework null, Node 22.x, install and build commands from `vercel.json`, output `apps/farcaster-web/dist`. Add `VITE_PROTOCOL_DIRECT=1` only when this path should be live. `VITE_SNAP_API_BASE` and `VITE_WALLETCONNECT_PROJECT_ID` are optional as described above. The `/snap` rewrite points at `https://haatz.quilibrium.com` and does not attach an API key.

## Mobile

Not covered by the steps above. `apps/farcaster-mobile` is an Expo app and expects a Mac with Xcode, CocoaPods, and JDK 17. See `apps/farcaster-mobile/README.md` and `apps/farcaster-mobile/.env.example` (`EXPO_ACCESS_TOKEN`, `EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN`).
