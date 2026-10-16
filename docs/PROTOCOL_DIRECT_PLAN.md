# Protocol-direct SmashCast

Planning note. No implementation in this change.

SmashCast at `https://smashcast.vercel.app` writes through Farcaster's hosted API (`https://client.farcaster.xyz`, rewritten from `/fc-api`). `FarcasterApiClient.createCast` is `POST /v2/casts`. The Ed25519 signer that actually signs the cast is custodial on that service. As of 15–16 Oct 2026 that service is operated by NS0 PTE LTD / Network School, and write calls come back with `ApiError` reason `opt_in_required` unless the account has signed their Social Smart Contract. Their new terms also forbid using the service to compete with them. This plan is how SmashCast posts, likes, and follows as Snapchain messages instead, and what that gives up.

Checked against:

- Snapchain HTTP docs, including [Message API](https://snapchain.farcaster.xyz/reference/httpapi/message), [Casts](https://snapchain.farcaster.xyz/reference/httpapi/casts), [Links](https://snapchain.farcaster.xyz/reference/httpapi/links), [Reactions](https://snapchain.farcaster.xyz/reference/httpapi/reactions), [UserData](https://snapchain.farcaster.xyz/reference/httpapi/userdata), [Writing to snapchain](https://snapchain.farcaster.xyz/guides/writing-to-snapchain) (the `llms-full.txt` dump of the docs site, 16 Oct 2026).
- Published `@farcaster/core@0.18.11` (6 May 2026, the current npm release): `dist/index.d.ts` and `dist/index.mjs`.
- `packages/core/src/builders.ts` on `farcasterxyz/hub-monorepo` `main`, which is ahead of that npm release.
- OP Mainnet addresses in [farcasterxyz/contracts](https://github.com/farcasterxyz/contracts).

## What changes, in one path

Today a cast is a bearer-token JSON call. The hosted API holds the signer.

```
Composer
  -> useCreateCast (farcaster-client-hooks)
  -> FarcasterApiClient.createCast (farcaster-client-data)
  -> POST /v2/casts
  -> client.farcaster.xyz signs with its custodial signer
```

The replacement signs in the browser and submits bytes to any Snapchain node.

```
Composer
  -> useCreateCast
  -> protocol client
  -> makeCastAdd from @farcaster/core, NobleEd25519Signer
  -> POST /v1/submitMessage   (application/octet-stream, Message.encode)
  -> Snapchain node
```

Reads of a profile or a cast go to `GET /v1/...` on the same node. Ranked feeds, search, notifications, and DMs do not exist on that API.

## Signer registration

Two mechanisms. Prefer the first for people who can sign with the FID's custody key. Keep the second for nodes or package versions that reject gasless keys.

### Gasless `KEY_ADD` (no OP Mainnet transaction)

Documented as live on mainnet since Snapchain engine V16. The node accepts a `KEY_ADD` message. There is no KeyGateway transaction and no gas.

The message carries two EIP-712 signatures plus an envelope signature:

1. `SignedKeyRequest` metadata from the requesting app, bound to a `requestFid`. For a user adding their own key, request fid and custody signer are the user's. The docs warn that `getSignedKeyRequestMetadata()` signs the onchain `SignedKeyRequestValidator` domain (chain id 10, with a `verifyingContract`). Snapchain rejects that. The gasless helper is `getGaslessSignedKeyRequestMetadata()`.
2. A `KeyAdd` signature from the FID's custody address. It covers the key, the scopes, the TTL, and the nonce.
3. The envelope is signed by the new Ed25519 key (proof of possession). That is why `KEY_ADD` does not require the signer to already be registered.

Constraints from the same doc:

- Scopes are an explicit list of `MessageType`s. A key scoped only to `CAST_ADD` cannot publish `LINK_ADD`. `KEY_ADD` and `KEY_REMOVE` are never valid scopes.
- Sliding TTL, maximum 90 days, refreshed when the key signs a message that gets merged. An unused key expires.
- Per-FID nonce, strictly greater than `currentUserNonce` from `GET /v1/signersByFid`.
- At most 1000 active gasless keys per FID. Onchain signers are a separate cap.
- `GET /v1/signersByFid` returns both kinds. `GET /v1/onChainSignersByFid` is onchain only and the docs mark it deprecated.

`makeKeyAddBody` and `makeKeyAdd` implement this in hub-monorepo `main`. They are **not** in `@farcaster/core@0.18.11` (`makeKeyAdd` and `signKeyAdd` are absent from `dist/index.d.ts`). The docs import them from `@farcaster/hub-nodejs` / `@farcaster/hub-web`, which re-export core. Phase 0 has to pin a release that actually contains those builders, or vendor the builder from a commit that a V16 node accepts. Do not code the milestone against 0.18.11 and assume `KEY_ADD` compiles.

### Onchain KeyGateway (published package can do this today)

`@farcaster/core@0.18.11` does export `Eip712Signer.signAdd(KeyGatewayAddMessage)`, `ViemLocalEip712Signer`, and `getSignedKeyRequestMetadata` for the onchain validator.

OP Mainnet (from the contracts repo):

| Contract | Address |
| --- | --- |
| IdRegistry | `0x00000000fc6c5f01fc30151999387bb99a9f489b` |
| KeyRegistry | `0x00000000fc1237824fb747abde0ff18990e59b7e` |
| KeyGateway | `0x00000000fc56947c7e7183f8ca4b62398caadf0b` |
| IdGateway | `0x00000000fc25870c6ed6b6c7e41fb078b7656f69` |
| StorageRegistry | `0x00000000fcce7f938e7ae6d3c335bd6a1a7c593d` |
| SignedKeyRequestValidator | `0x00000000fc700472606ed4fa22623acf62c60553` |
| Bundler | `0x00000000fc04c910a0b5fea33b03e0447ad0b0aa` |
| RecoveryProxy | `0x00000000fcb080a4d6c39a9354da9eb9bc104cd7` |

- `KeyGateway.add` is sent by the custody address and pays OP Mainnet gas.
- `KeyGateway.addFor` is sent by someone else, with the custody address's EIP-712 `Add` signature. That needs a relayer hot wallet. A static Hobby deployment cannot hold one. Skip `addFor` unless a later phase adds a real backend.

Onchain signers are scope-free and do not use the gasless TTL. The docs call them grandfathered relative to gasless keys.

New FIDs still need an onchain `IdGateway.register` plus one storage unit. The writing guide's figure is about $10 of ETH on OP Mainnet, paid to the gateway, which rents storage in the same flow. That cost is independent of which signer style we use. Existing FIDs that already rented storage do not repeat it.

## Writes

`makeMessage` in core sets `dataBytes` (blake3 truncated to 20 bytes over the protobuf `MessageData`). The published 0.18.11 bundle contains that Snapchain comment, so `makeCastAdd` from 0.18.11 already produces a submitable cast body. Snapchain rejects messages that only have the decoded `data` field.

`POST /v1/submitMessage` on port 3381:

- Body is `Message.encode(msg).finish()`, `Content-Type: application/octet-stream`.
- Success returns the message as JSON (hex for hashes and keys, base64 for signatures).
- If the node was started with `--rpc-auth user:pass`, send HTTP Basic auth. Reads stay open.
- `POST /v1/submitBulkMessages` submits several messages in order.
- `POST /v1/validateMessage` checks fid, signer, hash, and signature without merging. Useful before submit, and for frame actions the node will not accept as casts.

`submitMessage` is best-effort. The migration guide says a successful HTTP response can still fail to land in a block. The client has to read the message back (by hash, or by listing the FID's casts) before showing it as posted.

Builders we need, all present in 0.18.11 except the key builders:

| Action | Builder | Message |
| --- | --- | --- |
| Post | `makeCastAdd` | `CAST_ADD`. Text limit in the writing guide is 320 bytes, not 320 characters. |
| Delete cast | `makeCastRemove` | `CAST_REMOVE` with `targetHash`. |
| Like / unlike | `makeReactionAdd` / `makeReactionRemove` | `REACTION_TYPE_LIKE` and target `{ fid, hash }`. |
| Recast / unrecast | same | `REACTION_TYPE_RECAST`. |
| Follow / unfollow | `makeLinkAdd` / `makeLinkRemove` | `linkBody.type` is `follow`. Removal is `MESSAGE_TYPE_LINK_REMOVE`, not a different string. The writing guide's `type: 'unfollow'` example disagrees with the Links API (`link_type=follow`). Confirm against a node in phase 0 before copying that snippet. |
| Display name, bio, pfp, url | `makeUserDataAdd` | `USER_DATA_ADD`. |
| ETH verification | `makeVerificationAddEthAddress` / `makeVerificationRemove` | Custody (EIP-712) signs the claim. The Ed25519 signer signs the message. |
| Username | fname transfer, then `makeUsernameProof` | See fname below. |

Farcaster timestamps are seconds since 2021-01-01 00:00:00 UTC (`getFarcasterTime`).

## Reads

A node does not rank, search, or notify. These GETs are the whole read API we can rely on without an indexer. Pagination is `pageSize`, `reverse=1`, and `pageToken`. Errors are HTTP 400 or 500 with `errCode`, `details`, and `metadata`.

| Screen | Endpoint |
| --- | --- |
| Profile fields | `GET /v1/userDataByFid?fid=` |
| Username | `GET /v1/userNameProofsByFid?fid=` and `https://fnames.farcaster.xyz/transfers/current?fid=` |
| FID for an address | `GET /v1/onChainIdRegistryEventByAddress?address=` |
| Casts | `GET /v1/castsByFid?fid=&reverse=1` |
| Thread | `GET /v1/castsByParent?fid=&hash=` |
| Mentions | `GET /v1/castsByMention?fid=` |
| Likes and recasts on a cast | `GET /v1/reactionsByCast?target_fid=&target_hash=&reaction_type=Like` (or `Recast`) |
| Following | `GET /v1/linksByFid?fid=&link_type=follow` |
| Followers | `GET /v1/linksByTargetFid?target_fid=&link_type=follow` |
| Verifications | `GET /v1/verificationsByFid?fid=` |
| Storage left | `GET /v1/storageLimitsByFid?fid=` |
| Signers and nonce | `GET /v1/signersByFid?fid=` |

One storage unit is 500 messages per hour and 10,000 stored messages per type, from the Snapchain whitepaper section of the docs. Past the cap, the oldest message of that type is dropped. Follows are not a safe thing to churn.

There is no following-feed endpoint. A chronological home feed is "list follows, then `castsByFid` for each, then merge." That is fine for a small account and a bad default for someone following hundreds of people. Channels are a parent URL (`castsByParent?url=`), not a membership service. Search and notification inboxes are not on the node.

The HTTP API does not expose the sync/stream RPCs. Those stay on gRPC port 3383. Live updates on a static site mean polling HTTP.

The fname registry at `fnames.farcaster.xyz` is still a hosted service. Registering a name is an offchain transfer signed by the custody address (`POST /transfers`), then a `USERNAME_PROOF` message. Protocol-direct casts do not need an fname. Profile URLs like `/dwr` do, until we also accept `/fid/3`.

## Where this repo changes

Do not rewrite `FarcasterApiClient.ts` in place. It is the hosted client (casts, DMs, mini apps, feeds, warps, auth tokens) and phase 1 only replaces a few writes. Add a sibling and switch the hooks that the milestone needs.

### New

`packages/farcaster-protocol` (name can change):

- Dependency on `@farcaster/core` at a commit or version that includes `makeKeyAdd` if phase 0 says gasless is the path. Otherwise 0.18.11 plus an onchain `KeyGateway.add`.
- `submitMessage` / `validateMessage` over `fetch` with an `Uint8Array` body.
- Read helpers for the endpoints in the table above, returning the JSON message shape rather than the hosted API's `ApiCast`.
- A small mapper from Snapchain `CastAdd` / `UserData` / `Link` / `Reaction` into the `ApiCast` and user shapes the web UI already renders. Keeping that mapper in one place is what lets `Composer` and the profile page stay.

Signer bytes do not belong in this package's source. The web app generates them and passes a `NobleEd25519Signer`.

### `packages/farcaster-client-data`

Leave `AbstractFarcasterApiClient` and the bearer-token transport. The hosted base URL stays `https://client.farcaster.xyz` for anything we have not replaced.

Phase 1 reads these methods only to know what the hooks call today:

- `createCast` / delete cast: `POST` and `DELETE /v2/casts`
- `createCastLike` / delete: `PUT` and `DELETE /v2/cast-likes`
- recast: `PUT` and `DELETE /v2/recasts`
- follow: `PUT /v2/follows`
- `updateUser`: `PATCH /v2/me` (phase 4, `makeUserDataAdd`)
- verifications: `/v2/verifications` (phase 4)

Direct casts (`/v2/direct-cast-*`) stay on this client until DMs have their own design. They are not Snapchain messages.

### `packages/farcaster-client-hooks`

Phase 1 swaps the transport inside:

- `src/hooks/data/mutations/useCreateCast.ts`
- `useCreateCastLike.ts`
- `useCreateRecast.ts`
- `useCreateFollow.ts` (`PUT /v2/follows`)
- the matching delete hooks

`FarcasterApiClientProvider` can grow a protocol client next to the existing one so hooks can branch on "local signer present" without a second React tree. The other ~260 mutation hooks (mini apps, warps, audio rooms, starter packs, notification settings, onboarding) keep calling the hosted API and will fail with `opt_in_required` for users who have not signed the contract. The UI for those should show that they are unavailable, not a generic error, once phase 1 exists.

### `packages/farcaster-cryptography` and `farcaster-cryptography-web`

These are the DM ratchet (X25519, double ratchet, `IndexedDBKeyStore`). Do not store the protocol Ed25519 key in that store. A separate IndexedDB database avoids mixing ratchet state with the signer. The web package is still the pattern for "key lives in this browser."

### Web app

Phase 1:

- New sign-in path next to `src/components/login/` (QR to `farcaster.xyz/login-web`, and email magic link). Those two flows mint a hosted bearer token and do not yield a custody key.
- `src/contexts/AuthProvider.tsx` today persists an `authToken`. Protocol mode persists FID, custody address, and a handle to the local signer. The bearer token can remain for hosted reads during the transition.
- `src/contexts/WebFarcasterApiClientProvider.tsx` and `src/constants/api.ts` keep `/fc-api` for leftover hosted reads. Add the Snapchain base the same way (`VITE_SNAP_API_BASE`), so production can be a same-origin path.
- `src/components/composer/Composer.tsx` can stay if `useCreateCast` keeps its arguments.
- `src/components/casts/actions/Reactions.tsx` same for likes.
- `src/components/EmbeddedWallet.tsx` loads `https://wallet.farcaster.xyz` in an iframe and speaks MessageChannel RPC. That origin is the hosted custody wallet, not a key this repo has. Do not depend on it to sign `KeyAdd`. See open questions.

`apps/farcaster-mobile` is out of scope until the web milestone works. It calls the same hooks, so a hook-level switch helps later, but the mobile signer storage is a different problem.

## What gets worse or disappears

Protocol messages do not carry `opt_in_required`. That error is the hosted API. A node merges a valid signed message whether or not the account signed Network School's contract. Reporting on 15–16 Oct 2026 (The Block, and follow-ups) says people who decline the contract are read-only inside the official app, and that the protocol stays open for other clients. So:

- Casts posted from SmashCast are visible to any client that reads a hub, including SmashCast.
- The official app can hide them, or hide the account, without the node rejecting the message. "Moved to another client" in those articles is an app policy, not a field we found on the message. Treat official-app distribution as degraded for anyone who does not opt in, and as something we cannot promise.

Also gone, or reduced to a naive version, until a later phase builds it:

| Hosted feature | Protocol substitute |
| --- | --- |
| Ranked home feed | None. Chronological merge of `castsByFid` is the honest version, and it needs an indexer past a small following list. |
| Search | None on the hub HTTP API. |
| Notifications | No inbox. `castsByMention` is the mention half. Likes of your casts require reading `reactionsByCast` per cast, or an indexer. |
| Channels as objects (membership, ranking, pins) | A parent URL on the cast only. |
| DMs | Separate system (`/v2/direct-cast-*` and the ratchet packages). Not replicated by `submitMessage`. |
| Mini apps, frames host, warps, in-app purchases | Hosted product. `makeFrameAction` exists for the signed action payload, not for the host, manifest, or notifications. |
| Magic-link and QR sign-in | Those prove possession to the hosted API. They do not give us the custody key. |
| fname directory | Still `fnames.farcaster.xyz`. A single hosted dependency for names. |
| Storage eviction | Old casts and, worse, old follows can fall out when a unit is full. The hosted API hid this. |

## Where writes and reads run

Compared for the milestone, not as a permanent vendor choice.

### Self-hosted Snapchain

[Requirements](https://snapchain.farcaster.xyz/getting-started): 16 GB RAM, 4 vCPU, **2 TB** free disk, public ports 3381 (HTTP), 3382, 3383 (gRPC). Sync is a snapshot download plus gossip. The AWS guide in the same docs starts from a 2 TB gp3 volume.

- Cost is the machine, not per request. No API key.
- Reliability is ours: one node is a single point of failure, disk fills, and a bad snapshot means a resync. Run at least one spare before this is the only write path.
- Reads and `submitMessage` are unauthenticated unless we turn on `--rpc-auth`.
- Cannot run on Vercel. Hobby has no disk and no long-lived process.

### Neynar

Public pricing as of their June 2026 plan note:

- New customers: Free (10M credits/month, 600 RPM per endpoint) or Scale ($249/month, 60M credits, 1200 RPM). Enterprise is custom. Starter ($9) and Growth ($49) are grandfathered only.
- Credits, from their compute-units page: `POST /v2/farcaster/cast` is 150, follow and reaction writes are 10, a monthly active signer is 20,000 credits. Their higher-level write API is not the same thing as raw `submitMessage`.
- Hub access is a different host, `https://snapchain-api.neynar.com`, with an `x-api-key` header. gRPC streaming pricing was still marked WIP.

Neynar's position after 15 Oct 2026 is the actual risk. Network School acquired the Farcaster app, protocol repositories, and "related products" from Neynar. Neynar's co-founders said they are leaving; other employees were described as joining Network School. Clanker's fate was not in that announcement. The developer API was not given a shutdown date in the reporting we used, and it also was not clearly excluded from the transfer. August 2026 reporting already had Neynar looking for a new operator and returning capital. Treat the API as usable while it answers, and as a bad sole dependency.

An API key cannot ship in the static client. A Vercel rewrite can proxy to a URL; it cannot attach `x-api-key`. Keyed Neynar calls need a server that holds the key.

### Vercel Hobby, which is what smashcast.vercel.app is

The site stays a static build (`vercel.json`, `pnpm build:web`, `apps/farcaster-web/dist`, Node 22). Protocol code runs in the browser.

- Ed25519 key and the cast signature stay in the browser. That fits Hobby.
- Gasless `KEY_ADD` also fits, if the user can sign EIP-712 with the custody key locally. No relayer.
- `KeyGateway.add` fits only as a wallet transaction the user sends to OP Mainnet. `addFor` does not fit without a backend key.
- Browser `fetch` of `POST` bytes to a hub on another origin depends on that hub's CORS. We have not measured a public hub. `client.farcaster.xyz` does not allow arbitrary origins; a Snapchain node may be the same. If it is, add a rewrite next to `/fc-api`, for example `/snap/:path*` to an HTTPS hub we control. The hobby rewrite forwards the body. It does not add auth headers.
- A node on `:3381` without TLS is a poor rewrite target. Put Caddy or nginx in front of 3381 before pointing Vercel at it.
- Do not point the rewrite at a keyed Neynar URL.
- gRPC subscribe cannot be proxied by a static rewrite. Poll.

Recommended split for the milestone: browser signing, submit and profile reads through a same-origin rewrite to one HTTPS Snapchain endpoint we operate (or an open one, if phase 0 finds one that already sends `Access-Control-Allow-Origin`). Add an indexer only when the home feed is in scope.

## Phases

Scope is what has to be built, not a calendar.

### Phase 0 — confirm the node and the package

A script, not a UI. Against a hub we can actually reach:

- `makeCastAdd` from the pinned package, `submitMessage`, then `castsByFid` shows the cast.
- Gasless `KEY_ADD` from hub-monorepo `main` (or a newer npm release if one exists by then) is accepted, and `signersByFid` lists the key. If the live engine rejects it, the milestone uses `KeyGateway.add` and 0.18.11.
- `makeLinkRemove` with `type: 'follow'` versus the docs' `'unfollow'`.
- CORS: `OPTIONS` and `POST` from `Origin: https://smashcast.vercel.app`. Record `Access-Control-Allow-Origin`. This decides whether `vercel.json` needs a `/snap` rewrite.
- `submitMessage` success followed by a read, so we know how long "best effort" takes on that node.

### Phase 1 — smallest useful client

Sign in with a wallet that **is** the FID's custody address. Create an Ed25519 key, register it (gasless if phase 0 passed), and post, like, recast, and follow. Read that user's profile and casts from the node.

In scope: the new package, IndexedDB for the signer, one new login entry, the four write hooks, profile and cast rendering through the mapper, and the rewrite if CORS failed.

Out of scope: home feed, search, notifications, DMs, mini apps, new FID registration, fname registration, mobile.

The existing QR and email login stay for people still reading through the hosted API. They cannot post through this path.

### Phase 2 — a feed you can scroll

Chronological following. Either a worker beside the node (subscribe on gRPC, write posts and follows to Postgres, serve one feed URL) or a hosted indexer while it lasts. Threads via `castsByParent`. Mentions via `castsByMention`.

This worker is not a Vercel function. It sits next to the node.

### Phase 3 — leave the hosted product behind in the UI

Disable or replace surfaces that will keep returning `opt_in_required`: DMs, mini apps, ranked feeds, channel admin, warps, notification settings. A ranked feed is a product decision, not a protocol feature. Do not block phase 1 on it.

### Phase 4 — accounts that did not already exist

`IdGateway.register` plus storage for a new FID (~$10 on OP Mainnet, from the writing guide). fname registration against `fnames.farcaster.xyz`. Profile edits via `makeUserDataAdd`. ETH verifications. Recovery for FIDs whose custody key we do not have, once the open questions below have answers.

## Open questions

1. **Custody key for app-created accounts.** `EmbeddedWallet.tsx` does not hold the key. It iframes `https://wallet.farcaster.xyz`. Most FIDs created in the official app have that hosted wallet as custody. Gasless `KEY_ADD` and `KeyGateway.add` both need a signature from that address. We do not know whether that origin will sign a Snapchain `KeyAdd` typed-data payload for a third-party client, or whether a user can export the key. Until that is known, phase 1 only supports wallets the user already controls (the address `IdRegistry.idOf` maps to their FID).
2. **Recovery.** `RecoveryProxy` is `0x00000000fcb080a4d6c39a9354da9eb9bc104cd7`. If the user set a recovery address they control, they may be able to move the FID to a new custody key. The delay, the exact call (`recover` vs `transfer`), and whether Network School's wallet UI still lets them change recovery are unverified. Do not promise recovery in the milestone.
3. **Which core version a V16 node accepts.** Docs and `main` describe gasless keys. npm 0.18.11 does not build them. Pin after phase 0, not before.
4. **Public hub CORS and abuse policy.** `crackle.farcaster.xyz:3383` in the docs is a password-protected gRPC example, not a browser endpoint. An open HTTP submit endpoint may not exist, or may not want browser traffic.
5. **fname server.** Still centralized. How long `fnames.farcaster.xyz` keeps accepting transfers from non-opted-in custody keys is unknown. Profile pages should work by FID even if fname registration fails.
6. **Official-app visibility.** Confirm with one real cast whether a non-opted-in FID's hub cast shows in the official app. The plan assumes it might not.
7. **Neynar's developer API after the sale.** No shutdown date was published. Revisit before paying for Scale or building the feed on their indexer.
8. **Storage eviction of follows.** Decide whether the client refuses a follow that would drop an older one, once `storageLimitsByFid` says the unit is near the cap.

## Sources

- Snapchain message submit: https://snapchain.farcaster.xyz/reference/httpapi/message
- Snapchain HTTP overview (port 3381, pagination, no sync on HTTP): https://snapchain.farcaster.xyz/reference/httpapi/httpapi
- Node size: https://snapchain.farcaster.xyz/getting-started
- Gasless signer walkthrough: https://snapchain.farcaster.xyz/guides/writing-to-snapchain
- Message builders as documented for hub-nodejs: https://docs.farcaster.xyz/developers/guides/writing/messages
- `@farcaster/core@0.18.11`: https://www.npmjs.com/package/@farcaster/core
- Contracts and OP addresses: https://github.com/farcasterxyz/contracts
- Neynar plans (June 2026 note) and credit costs: https://docs.neynar.com/reference/what-are-the-rate-limits-on-neynar-apis and https://docs.neynar.com/reference/compute-units
- Network School acquisition, 15 Oct 2026: https://www.theblock.co/news/ecosystems/2026-10-15-network-school-acquires-farcaster-from-neynar-418720
