import { ed25519 } from '@noble/curves/ed25519';

export const MEDIA_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_UPLOAD_MAX_AGE_MS = 5 * 60 * 1000;
const MEDIA_UPLOAD_FUTURE_SKEW_MS = 60 * 1000;

const CONTENT_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
} as const;

export type MediaContentType = keyof typeof CONTENT_EXTENSIONS;

export type MediaUploadProof = {
  fid: number;
  timestamp: number;
  pathname: string;
  sha256: string;
  contentType: MediaContentType;
  size: number;
  publicKey: string;
  signature: string;
};

type SignedMediaUpload = Omit<MediaUploadProof, 'publicKey' | 'signature'>;

export class MediaUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaUploadError';
  }
}

export function canonicalMediaUploadMessage(proof: SignedMediaUpload): string {
  return [
    'smashcast-media-upload',
    'v1',
    `fid:${proof.fid}`,
    `timestamp:${proof.timestamp}`,
    `pathname:${proof.pathname}`,
    `sha256:${proof.sha256}`,
    `contentType:${proof.contentType}`,
    `size:${proof.size}`,
  ].join('\n');
}

export function randomCastImagePath(
  fid: number,
  contentType: MediaContentType,
): string {
  const bytes = new Uint8Array(16);
  const webCrypto = (
    globalThis as {
      crypto?: { getRandomValues(array: Uint8Array): Uint8Array };
    }
  ).crypto;
  if (!webCrypto) {
    throw new MediaUploadError('Crypto randomness is not available');
  }
  webCrypto.getRandomValues(bytes);
  const id = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `casts/${fid}/${id}.${CONTENT_EXTENSIONS[contentType]}`;
}

export function signMediaUpload(
  privateKey: Uint8Array,
  message: string,
): Uint8Array {
  return ed25519.sign(new TextEncoder().encode(message), privateKey);
}

export function verifyMediaUploadSignature(
  publicKey: Uint8Array,
  message: string,
  signature: Uint8Array,
): boolean {
  try {
    return ed25519.verify(
      signature,
      new TextEncoder().encode(message),
      publicKey,
    );
  } catch {
    return false;
  }
}

function isContentType(value: string): value is MediaContentType {
  return Object.prototype.hasOwnProperty.call(CONTENT_EXTENSIONS, value);
}

function pathnameMatches(
  pathname: string,
  fid: number,
  contentType: MediaContentType,
): boolean {
  const match = /^casts\/(\d+)\/([0-9a-f]{32})\.(jpg|png|gif|webp)$/.exec(
    pathname,
  );
  if (!match) {
    return false;
  }
  return (
    Number(match[1]) === fid && match[3] === CONTENT_EXTENSIONS[contentType]
  );
}

function decodeHex(hex: string, label: string): Uint8Array {
  const normalized = hex.trim().toLowerCase().replace(/^0x/, '');
  if (normalized.length === 0 || normalized.length % 2 !== 0) {
    throw new MediaUploadError(`${label} is not valid hex`);
  }
  if (!/^[0-9a-f]+$/.test(normalized)) {
    throw new MediaUploadError(`${label} is not valid hex`);
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(
      normalized.slice(index * 2, index * 2 + 2),
      16,
    );
  }
  return bytes;
}

function readProof(clientPayload: string | null): MediaUploadProof {
  if (!clientPayload) {
    throw new MediaUploadError('Upload proof is missing');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(clientPayload);
  } catch {
    throw new MediaUploadError('Upload proof is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new MediaUploadError('Upload proof is not valid');
  }
  const record = parsed as Record<string, unknown>;
  const fid = record.fid;
  const timestamp = record.timestamp;
  const pathname = record.pathname;
  const sha256 = record.sha256;
  const contentType = record.contentType;
  const size = record.size;
  const publicKey = record.publicKey;
  const signature = record.signature;
  if (!Number.isSafeInteger(fid) || (fid as number) <= 0) {
    throw new MediaUploadError('Upload proof FID is not valid');
  }
  if (!Number.isSafeInteger(timestamp)) {
    throw new MediaUploadError('Upload proof timestamp is not valid');
  }
  if (typeof pathname !== 'string' || typeof sha256 !== 'string') {
    throw new MediaUploadError('Upload proof is not valid');
  }
  if (typeof contentType !== 'string' || !isContentType(contentType)) {
    throw new MediaUploadError('Images must be JPEG, PNG, GIF, or WebP');
  }
  if (!Number.isSafeInteger(size) || (size as number) <= 0) {
    throw new MediaUploadError('Upload proof size is not valid');
  }
  if ((size as number) > MEDIA_UPLOAD_MAX_BYTES) {
    throw new MediaUploadError('Images must be 10 MB or smaller');
  }
  if (!/^[0-9a-f]{64}$/i.test(sha256)) {
    throw new MediaUploadError('Upload proof hash is not valid');
  }
  if (typeof publicKey !== 'string' || typeof signature !== 'string') {
    throw new MediaUploadError('Upload proof signature is missing');
  }
  return {
    fid: fid as number,
    timestamp: timestamp as number,
    pathname,
    sha256: sha256.toLowerCase(),
    contentType,
    size: size as number,
    publicKey,
    signature,
  };
}

/** Checks the signature, age, pathname, type, and size. Does not call the hub. */
export function verifyMediaUploadProof(
  clientPayload: string | null,
  now: number,
): MediaUploadProof {
  const proof = readProof(clientPayload);
  if (now - proof.timestamp > MEDIA_UPLOAD_MAX_AGE_MS) {
    throw new MediaUploadError('Upload proof expired. Try the image again.');
  }
  if (proof.timestamp - now > MEDIA_UPLOAD_FUTURE_SKEW_MS) {
    throw new MediaUploadError('Upload proof timestamp is too far ahead');
  }
  if (!pathnameMatches(proof.pathname, proof.fid, proof.contentType)) {
    throw new MediaUploadError('Upload pathname is not allowed');
  }
  const publicKey = decodeHex(proof.publicKey, 'Public key');
  const signature = decodeHex(proof.signature, 'Signature');
  if (publicKey.length !== 32 || signature.length !== 64) {
    throw new MediaUploadError('Upload proof signature is not valid');
  }
  const message = canonicalMediaUploadMessage(proof);
  if (!verifyMediaUploadSignature(publicKey, message, signature)) {
    throw new MediaUploadError('Upload proof signature is not valid');
  }
  return proof;
}

export type HubMediaSigner = {
  key?: string;
  onChainEvent?: {
    signerEventBody?: {
      eventType?: string;
    };
  };
};

/** Keeps keys the hub still lists. A removed onchain signer is not authorized. */
export function activeHubSignerKeys(
  signers: HubMediaSigner[],
): { key: string }[] {
  const keys: { key: string }[] = [];
  for (const signer of signers) {
    if (
      signer.onChainEvent?.signerEventBody?.eventType ===
      'SIGNER_EVENT_TYPE_REMOVE'
    ) {
      continue;
    }
    if (typeof signer.key === 'string' && signer.key.length > 0) {
      keys.push({ key: signer.key });
    }
  }
  return keys;
}

export function authorizeMediaUpload(params: {
  pathname: string;
  clientPayload: string | null;
  now: number;
  signers: { key: string }[];
}): MediaUploadProof {
  const proof = verifyMediaUploadProof(params.clientPayload, params.now);
  if (proof.pathname !== params.pathname) {
    throw new MediaUploadError('Signed pathname does not match the upload');
  }
  const wanted = proof.publicKey.toLowerCase().replace(/^0x/, '');
  const registered = params.signers.some(
    (signer) => signer.key.toLowerCase().replace(/^0x/, '') === wanted,
  );
  if (!registered) {
    throw new MediaUploadError('This signer is not registered for that FID');
  }
  return proof;
}
