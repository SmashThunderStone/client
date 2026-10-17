import { put } from '@vercel/blob/client';
import {
  canonicalMediaUploadMessage,
  MEDIA_UPLOAD_MAX_BYTES,
  type MediaContentType,
  randomCastImagePath,
  signMediaUpload,
} from 'farcaster-protocol';
import { useCallback } from 'react';

import { getProtocolSession } from '~/protocol/bridge';

import {
  castImageSrcForFile,
  publishCastImageProgress,
  registerCastImageAbort,
} from './castImageUploadProgress';

const CONTENT_TYPES: Record<string, MediaContentType> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
};

const EXTENSION_TYPES: Record<string, MediaContentType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

function contentTypeForFile(file: File): MediaContentType | null {
  const fromType = CONTENT_TYPES[file.type.toLowerCase()];
  if (fromType) {
    return fromType;
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? null;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function publicBlobUrl(clientToken: string, pathname: string): string {
  const prefix = 'vercel_blob_client_';
  if (!clientToken.startsWith(prefix)) {
    throw new Error('Upload token was not a Vercel Blob client token');
  }
  const storeId = clientToken.slice(prefix.length).split('_')[0];
  if (!storeId || !/^[A-Za-z0-9]+$/.test(storeId)) {
    throw new Error('Upload token is missing a store id');
  }
  return `https://${storeId}.public.blob.vercel-storage.com/${pathname}`;
}

async function simulateDevUpload(src: string, signal: AbortSignal) {
  for (const percent of [20, 55, 85]) {
    if (signal.aborted) {
      return;
    }
    publishCastImageProgress(src, percent);
    await new Promise((resolve) => {
      setTimeout(resolve, 160);
    });
  }
}

const useProtocolCastImageUpload = () => {
  return useCallback(async ({ file }: { file: File }) => {
    const session = getProtocolSession();
    if (!session) {
      throw new Error('Sign in with your wallet to upload an image.');
    }
    const contentType = contentTypeForFile(file);
    if (!contentType) {
      throw new Error('Use a JPEG, PNG, GIF, or WebP image.');
    }
    if (file.size > MEDIA_UPLOAD_MAX_BYTES) {
      throw new Error('Images must be 10 MB or smaller.');
    }

    const pathname = randomCastImagePath(session.fid, contentType);
    const sha256 = await sha256Hex(file);
    const timestamp = Date.now();
    const message = canonicalMediaUploadMessage({
      fid: session.fid,
      timestamp,
      pathname,
      sha256,
      contentType,
      size: file.size,
    });
    const clientPayload = JSON.stringify({
      fid: session.fid,
      timestamp,
      pathname,
      sha256,
      contentType,
      size: file.size,
      publicKey: bytesToHex(session.publicKey),
      signature: bytesToHex(signMediaUpload(session.privateKey, message)),
    });

    const src = castImageSrcForFile(file);
    const controller = new AbortController();
    if (src) {
      registerCastImageAbort(src, controller);
      publishCastImageProgress(src, 5);
    }

    const response = await fetch('/api/media', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'blob.generate-client-token',
        payload: {
          pathname,
          clientPayload,
          multipart: false,
        },
      }),
      signal: controller.signal,
    });
    const json = (await response.json().catch(() => ({}))) as {
      error?: string;
      clientToken?: string;
      devMock?: { url?: string };
    };
    if (!response.ok) {
      throw new Error(json.error || 'Image upload was rejected');
    }

    const previewUrl = URL.createObjectURL(file);
    const devMockUrl = import.meta.env.DEV ? json.devMock?.url : undefined;
    if (devMockUrl) {
      const uploadPromise = (
        src ? simulateDevUpload(src, controller.signal) : Promise.resolve()
      ).then(() => {
        if (src) {
          publishCastImageProgress(src, null);
        }
        return new Response(null, { status: 200 });
      });
      return {
        version: 'v2' as const,
        previewUrl,
        imageUrl: devMockUrl,
        uploadPromise,
      };
    }

    if (!json.clientToken) {
      throw new Error('Image upload did not return a token');
    }
    const imageUrl = publicBlobUrl(json.clientToken, pathname);
    const uploadPromise = put(pathname, file, {
      access: 'public',
      token: json.clientToken,
      contentType,
      abortSignal: controller.signal,
      onUploadProgress: ({ percentage }) => {
        if (src) {
          publishCastImageProgress(src, percentage);
        }
      },
    })
      .then((blob) => {
        const filename = pathname.slice(pathname.lastIndexOf('/') + 1);
        if (!blob.url.includes(filename)) {
          throw new Error('Uploaded image URL did not match the signed name');
        }
        return new Response(null, { status: 200 });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return new Response(null, { status: 200 });
        }
        throw error;
      })
      .finally(() => {
        if (src) {
          publishCastImageProgress(src, null);
        }
      });

    return {
      version: 'v2' as const,
      previewUrl,
      imageUrl,
      uploadPromise,
    };
  }, []);
};

export { useProtocolCastImageUpload };
