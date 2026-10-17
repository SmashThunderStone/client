import { describe, expect, it } from 'vitest';

import {
  authorizeMediaUpload,
  canonicalMediaUploadMessage,
  MEDIA_UPLOAD_MAX_AGE_MS,
  MediaUploadError,
  signMediaUpload,
  verifyMediaUploadProof,
} from './mediaAuth';
import { generateEd25519Keypair } from './signer';

const FID = 218142;
const PATH = `casts/${FID}/${'ab'.repeat(16)}.jpg`;
const HASH = 'cd'.repeat(32);

function payload(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  overrides: Record<string, unknown> = {},
) {
  const body = {
    fid: FID,
    timestamp: 1_700_000_000_000,
    pathname: PATH,
    sha256: HASH,
    contentType: 'image/jpeg',
    size: 1200,
    ...overrides,
  };
  const message = canonicalMediaUploadMessage({
    fid: body.fid as number,
    timestamp: body.timestamp as number,
    pathname: body.pathname as string,
    sha256: body.sha256 as string,
    contentType: body.contentType as 'image/jpeg',
    size: body.size as number,
  });
  const signature = signMediaUpload(privateKey, message);
  const signatureHex = Array.from(signature, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const publicKeyHex = Array.from(publicKey, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return JSON.stringify({
    ...body,
    publicKey: `0x${publicKeyHex}`,
    signature: `0x${signatureHex}`,
  });
}

describe('media upload proofs', () => {
  const { privateKey, publicKey } = generateEd25519Keypair();
  const now = 1_700_000_000_000;

  it('accepts a fresh signature from the matching key', () => {
    const proof = verifyMediaUploadProof(payload(privateKey, publicKey), now);
    expect(proof.fid).toBe(FID);
    expect(proof.pathname).toBe(PATH);
    expect(
      authorizeMediaUpload({
        pathname: PATH,
        clientPayload: payload(privateKey, publicKey),
        now,
        signers: [{ key: `0x${Buffer.from(publicKey).toString('hex')}` }],
      }).contentType,
    ).toBe('image/jpeg');
  });

  it('rejects a signature from a different key', () => {
    const other = generateEd25519Keypair();
    const signed = JSON.parse(payload(privateKey, publicKey)) as {
      publicKey: string;
      signature: string;
    };
    signed.publicKey = `0x${Buffer.from(other.publicKey).toString('hex')}`;
    expect(() => verifyMediaUploadProof(JSON.stringify(signed), now)).toThrow(
      MediaUploadError,
    );
  });

  it('rejects a proof older than five minutes', () => {
    expect(() =>
      verifyMediaUploadProof(
        payload(privateKey, publicKey),
        now + MEDIA_UPLOAD_MAX_AGE_MS + 1,
      ),
    ).toThrow(/expired/);
  });

  it('rejects a timestamp more than a minute ahead', () => {
    expect(() =>
      verifyMediaUploadProof(
        payload(privateKey, publicKey, { timestamp: now + 61_000 }),
        now,
      ),
    ).toThrow(/ahead/);
  });

  it('rejects a tampered pathname, a foreign FID, and a non-image type', () => {
    const signed = JSON.parse(payload(privateKey, publicKey)) as {
      pathname: string;
    };
    signed.pathname = `casts/${FID}/${'cd'.repeat(16)}.jpg`;
    expect(() => verifyMediaUploadProof(JSON.stringify(signed), now)).toThrow(
      /signature/i,
    );

    expect(() =>
      verifyMediaUploadProof(
        payload(privateKey, publicKey, {
          pathname: `casts/1/${'ab'.repeat(16)}.jpg`,
        }),
        now,
      ),
    ).toThrow(/pathname/i);

    expect(() =>
      verifyMediaUploadProof(
        payload(privateKey, publicKey, { contentType: 'image/svg+xml' }),
        now,
      ),
    ).toThrow(/JPEG/);
  });

  it('rejects files over 10 MB and a signer the hub does not list', () => {
    expect(() =>
      verifyMediaUploadProof(
        payload(privateKey, publicKey, { size: 10 * 1024 * 1024 + 1 }),
        now,
      ),
    ).toThrow(/10 MB/);

    expect(() =>
      authorizeMediaUpload({
        pathname: PATH,
        clientPayload: payload(privateKey, publicKey),
        now,
        signers: [{ key: `0x${'11'.repeat(32)}` }],
      }),
    ).toThrow(/not registered/);
  });

  it('rejects a signed proof presented for a different pathname', () => {
    expect(() =>
      authorizeMediaUpload({
        pathname: `casts/${FID}/${'cd'.repeat(16)}.jpg`,
        clientPayload: payload(privateKey, publicKey),
        now,
        signers: [{ key: `0x${Buffer.from(publicKey).toString('hex')}` }],
      }),
    ).toThrow(/does not match/);
  });
});
