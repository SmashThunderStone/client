# farcaster-protocol

Browser-side Farcaster writes for SmashCast. Messages are built with `@farcaster/core@0.18.11` and submitted to a Snapchain HTTP API (`POST /v1/submitMessage`, body `Message` protobuf, `Content-Type: application/octet-stream`).

## What was checked against mainnet (16 Oct 2026)

`@farcaster/core@0.18.11` is the published package. A `CastAdd` it signs is `valid: true` on `POST /v1/validateMessage` for both hubs below. `POST /v1/submitMessage` with an unregistered Ed25519 key returns `bad_request.validation_failure/invalid signer` (the node parsed the message; the key is not registered). That is the format check for Phase 0.

| Hub | Role |
| --- | --- |
| `https://haatz.quilibrium.com` | Default. Snapchain 0.13.5, `Access-Control-Allow-Origin: *`, `OPTIONS /v1/submitMessage` returns 204, so the browser can submit without a proxy. |
| `https://snap.farcaster.xyz:3381` | Read replica, version 0.14.2. `OPTIONS /v1/submitMessage` is 404, so a browser preflight fails. Server-side validate/submit still parse 0.18.11 messages. |

`IdRegistry.idOf(0x48ed8e47f43ec015e9e09e3e1a4c647905c8c03f)` on OP Mainnet is FID 218142.

## Signer registration

`0.18.11` ships the `KEY_ADD` protobuf and `makeMessage`, but not `makeKeyAdd` / `getGaslessSignedKeyRequestMetadata` (those landed on hub-monorepo `main` after the release). The same three hubs parse `MESSAGE_TYPE_KEY_ADD` and answer `metadata is missing` when the metadata blob is empty, and `signersByFid` returns `currentUserNonce`. Gasless registration is implemented here from that FIP:

1. The custody wallet signs EIP-712 `SignedKeyRequest` and `KeyAdd` on domain `Farcaster KeyAdd`, version `1`, chainId `1` (no verifying contract). Deadlines are Farcaster seconds, not Unix time.
2. Metadata is the ABI `SignedKeyRequestMetadata` tuple `(requestFid, requestSigner, signature, deadline)`.
3. The new Ed25519 key signs the message envelope. `nonce` must be `currentUserNonce + 1`. Scopes are cast, reaction, link, and user-data types. TTL is 90 days, sliding.
4. `POST /v1/submitMessage`, then poll `signersByFid` until the key appears.

This costs no gas. It is not proven with a real custody signature in this repo, because that requires the FID owner's wallet.

If the node rejects the gasless message, the app falls back to `KeyGateway.add` on OP Mainnet (`0x00000000fc56947c7e7183f8ca4b62398caadf0b`). That signature uses domain `Farcaster SignedKeyRequestValidator` (chainId 10, the validator contract). The user pays OP gas. A direct add is an L2 transaction; at the 16 Oct 2026 base fee (~0.001 gwei) the execution cost is a fraction of a cent, and the L1 data fee is the part that moves (historically well under a dollar, often cents). New FID registration and storage rent are not part of this path. `addFor` (a relayer paying gas) is not used.

The Ed25519 seed stays in the web app's IndexedDB. `@farcaster/core`'s `NobleEd25519Signer` needs the raw seed, so the key cannot be a non-extractable WebCrypto key. The app never offers an export and deletes the record on sign-out.
