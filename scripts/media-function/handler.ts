// Source for api/media.js. scripts/bundle-media-function.mjs bundles this file,
// mediaAuth, and @vercel/blob into one CommonJS function. Vercel does not keep
// pnpm's node_modules symlinks, so a bare require("@vercel/blob/client") does
// not resolve in the built function.
import type { IncomingMessage, ServerResponse } from 'node:http';

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import {
  authorizeMediaUpload,
  MEDIA_UPLOAD_MAX_BYTES,
  verifyMediaUploadProof,
} from '../../packages/farcaster-protocol/src/mediaAuth';

export const runtime = 'nodejs';

export const config = {
  runtime: 'nodejs',
  maxDuration: 10,
};

const HUB_URL = process.env.SNAP_HUB_URL || 'https://haatz.quilibrium.com';
const SIGNER_CACHE_MS = 60_000;

const signerCache = new Map<
  number,
  { at: number; signers: { key: string }[] }
>();

type NodeRequest = IncomingMessage & {
  method?: string;
  body?: unknown;
};

export default async function handler(req: NodeRequest, res: ServerResponse) {
  if (req.method !== 'POST') {
    send(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = (await readBody(req)) as HandleUploadBody;
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const now = Date.now();
        const checked = verifyMediaUploadProof(clientPayload, now);
        if (checked.pathname !== pathname) {
          throw new Error('Signed pathname does not match the upload');
        }
        const proof = authorizeMediaUpload({
          pathname,
          clientPayload,
          now,
          signers: await signersForFid(checked.fid),
        });
        return {
          allowedContentTypes: [proof.contentType],
          maximumSizeInBytes: MEDIA_UPLOAD_MAX_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 5 * 60 * 1000,
          tokenPayload: JSON.stringify({ fid: proof.fid }),
        };
      },
    });
    send(res, 200, json);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Image upload was rejected';
    send(res, 400, { error: message });
  }
}

async function signersForFid(fid: number): Promise<{ key: string }[]> {
  const cached = signerCache.get(fid);
  if (cached && Date.now() - cached.at < SIGNER_CACHE_MS) {
    return cached.signers;
  }
  const response = (await fetch(`${HUB_URL}/v1/signersByFid?fid=${fid}`)) as {
    ok: boolean;
    json(): Promise<{ signers?: { key?: string }[] }>;
  };
  if (!response.ok) {
    throw new Error('Could not check this FID on the hub');
  }
  const json = await response.json();
  const signers = (json.signers ?? [])
    .map((signer) => signer.key)
    .filter((key): key is string => typeof key === 'string')
    .map((key) => ({ key }));
  signerCache.set(fid, { at: Date.now(), signers });
  return signers;
}

async function readBody(req: NodeRequest): Promise<unknown> {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
