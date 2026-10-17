import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import test from 'node:test';

process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore_supersecretvalue';
process.env.SNAP_HUB_URL = 'https://hub.test';

const require = createRequire(import.meta.url);
const handler = require('../../api/media.js');

const fetchCalls = [];

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

global.fetch = async (input) => {
  const url = new URL(String(input));
  fetchCalls.push(url.toString());
  const fid = url.searchParams.get('fid');
  const pageToken = url.searchParams.get('pageToken');
  if (fid === '218142' && !pageToken) {
    return jsonResponse({
      signers: [
        {
          key: `0x${'11'.repeat(32)}`,
          onChainEvent: {
            signerEventBody: { eventType: 'SIGNER_EVENT_TYPE_REMOVE' },
          },
        },
      ],
      nextPageToken: 'page-2',
    });
  }
  if (fid === '218142' && pageToken === 'page-2') {
    return jsonResponse({
      signers: [{ key: `0x${activePublicKey}` }],
    });
  }
  if (fid === '999001') {
    return jsonResponse({
      signers: [
        {
          key: `0x${activePublicKey}`,
          onChainEvent: {
            signerEventBody: { eventType: 'SIGNER_EVENT_TYPE_REMOVE' },
          },
        },
      ],
    });
  }
  return jsonResponse({ error: 'unexpected hub url' }, 500);
};

let activePublicKey = '';

function call(method, body) {
  const payload =
    body === undefined ? null : Buffer.from(JSON.stringify(body));
  const req = Readable.from(payload ? [payload] : []);
  req.method = method;
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 0,
      setHeader() {},
      end(chunk) {
        resolve({
          status: res.statusCode,
          json: JSON.parse(String(chunk)),
        });
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

async function signedProof(fid) {
  const pair = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  );
  const publicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', pair.publicKey),
  );
  const publicKeyHex = Buffer.from(publicKey).toString('hex');
  const pathname = `casts/${fid}/${'ab'.repeat(16)}.png`;
  const proof = {
    fid,
    timestamp: Date.now(),
    pathname,
    sha256: 'cd'.repeat(32),
    contentType: 'image/png',
    size: 32,
  };
  const message = [
    'smashcast-media-upload',
    'v1',
    `fid:${proof.fid}`,
    `timestamp:${proof.timestamp}`,
    `pathname:${proof.pathname}`,
    `sha256:${proof.sha256}`,
    `contentType:${proof.contentType}`,
    `size:${proof.size}`,
  ].join('\n');
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'Ed25519',
      pair.privateKey,
      new TextEncoder().encode(message),
    ),
  );
  return {
    publicKeyHex,
    body: {
      type: 'blob.generate-client-token',
      payload: {
        pathname,
        multipart: false,
        clientPayload: JSON.stringify({
          ...proof,
          publicKey: `0x${publicKeyHex}`,
          signature: `0x${Buffer.from(signature).toString('hex')}`,
        }),
      },
    },
  };
}

test('GET is 405 and an empty POST is 400', async () => {
  const get = await call('GET');
  assert.equal(get.status, 405);
  assert.equal(get.json.error, 'Method not allowed');

  const post = await call('POST', {});
  assert.equal(post.status, 400);
  assert.match(post.json.error, /event type/i);
});

test('a valid proof on the second signer page returns a client token', async () => {
  const proof = await signedProof(218142);
  activePublicKey = proof.publicKeyHex;
  fetchCalls.length = 0;
  const response = await call('POST', proof.body);
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.match(response.json.clientToken, /^vercel_blob_client_teststore_/);
  assert.equal(fetchCalls.length, 2);
});

test('an invalid proof and a removed signer are 400', async () => {
  const invalid = await call('POST', {
    type: 'blob.generate-client-token',
    payload: {
      pathname: 'casts/1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
      clientPayload: 'not-json',
      multipart: false,
    },
  });
  assert.equal(invalid.status, 400);
  assert.match(invalid.json.error, /not valid JSON/);

  const proof = await signedProof(999001);
  activePublicKey = proof.publicKeyHex;
  const removed = await call('POST', proof.body);
  assert.equal(removed.status, 400, JSON.stringify(removed.json));
  assert.match(removed.json.error, /not registered/);
});
