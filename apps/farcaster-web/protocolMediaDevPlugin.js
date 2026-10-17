import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mediaAuthModule = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../packages/farcaster-protocol/src/mediaAuth.ts',
);

/**
 * Local stand-in for the Vercel `/api/media` function. It checks the same
 * Ed25519 proof as production, then returns a fake public URL instead of
 * calling Vercel Blob. The hub signer lookup is skipped because this VM does
 * not have Smash's registered key. Production `api/media.js` does that lookup.
 */
export function protocolMediaDevPlugin() {
  return {
    name: 'smashcast-protocol-media-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0];
        if (pathname !== '/api/media') {
          next();
          return;
        }
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw || '{}');
          const uploadPath = body?.payload?.pathname;
          const clientPayload = body?.payload?.clientPayload ?? null;
          const protocol = await server.ssrLoadModule(mediaAuthModule);
          const proof = protocol.verifyMediaUploadProof(
            clientPayload,
            Date.now(),
          );
          if (proof.pathname !== uploadPath) {
            throw new protocol.MediaUploadError(
              'Signed pathname does not match the upload',
            );
          }
          const host = req.headers.host || '127.0.0.1:5199';
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              type: 'blob.generate-client-token',
              devMock: { url: `http://${host}/blob-mock/${proof.pathname}` },
            }),
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Image upload was rejected';
          res.statusCode = 400;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
