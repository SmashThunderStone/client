import { Message } from '@farcaster/core';

import { SnapchainError } from './result';

export type HubSigner = {
  key: string;
  keyType: number;
};

export type SignersByFid = {
  signers: HubSigner[];
  currentUserNonce: number;
  gaslessSignerCount: number;
  gaslessSignerLimit: number;
};

export class SnapchainHub {
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private endpoint(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async getJson<T>(path: string): Promise<T> {
    const response = await fetch(this.endpoint(path));
    if (!response.ok) {
      throw new SnapchainError(await readError(response), response.status);
    }
    return (await response.json()) as T;
  }

  async getOptionalJson<T>(path: string): Promise<T | null> {
    const response = await fetch(this.endpoint(path));
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new SnapchainError(await readError(response), response.status);
    }
    return (await response.json()) as T;
  }

  async submitMessage(message: Message): Promise<unknown> {
    const bytes = Message.encode(message).finish();
    const response = await fetch(this.endpoint('/v1/submitMessage'), {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes as BodyInit,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new SnapchainError(errorDetail(text), response.status);
    }
    return text ? JSON.parse(text) : {};
  }

  async validateMessage(message: Message): Promise<{ valid: boolean }> {
    const bytes = Message.encode(message).finish();
    const response = await fetch(this.endpoint('/v1/validateMessage'), {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes as BodyInit,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new SnapchainError(errorDetail(text), response.status);
    }
    return JSON.parse(text) as { valid: boolean };
  }
}

async function readError(response: Response): Promise<string> {
  try {
    return errorDetail(await response.text());
  } catch {
    return `Hub request failed (${response.status})`;
  }
}

function errorDetail(text: string): string {
  try {
    const json = JSON.parse(text) as {
      error?: string;
      error_detail?: string;
    };
    return json.error_detail || json.error || text;
  } catch {
    return text || 'Hub request failed';
  }
}

export async function submitAndReadBack(
  hub: SnapchainHub,
  message: Message,
  readBack: () => Promise<boolean>,
): Promise<void> {
  await hub.submitMessage(message);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      if (await readBack()) {
        return;
      }
    } catch {
      // The message is not visible yet.
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
  }
  throw new SnapchainError(
    'The hub accepted the submit but has not returned the message yet. Try again in a few seconds.',
    202,
  );
}

export async function getSignersByFid(
  hubUrl: string,
  fid: number,
): Promise<SignersByFid> {
  const hub = new SnapchainHub(hubUrl);
  const json = await hub.getJson<{
    signers?: HubSigner[];
    currentUserNonce?: number;
    gaslessSignerCount?: number;
    gaslessSignerLimit?: number;
  }>(`/v1/signersByFid?fid=${fid}`);
  return {
    signers: json.signers ?? [],
    currentUserNonce: json.currentUserNonce ?? 0,
    gaslessSignerCount: json.gaslessSignerCount ?? 0,
    gaslessSignerLimit: json.gaslessSignerLimit ?? 0,
  };
}

export function signerKeysInclude(
  signers: HubSigner[],
  publicKeyHex: string,
): boolean {
  const wanted = publicKeyHex.toLowerCase().replace(/^0x/, '');
  return signers.some(
    (signer) => signer.key.toLowerCase().replace(/^0x/, '') === wanted,
  );
}

export async function waitForSigner(params: {
  hubUrl: string;
  fid: number;
  publicKeyHex: string;
  attempts?: number;
}): Promise<boolean> {
  const attempts = params.attempts ?? 12;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const page = await getSignersByFid(params.hubUrl, params.fid);
    if (signerKeysInclude(page.signers, params.publicKeyHex)) {
      return true;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }
  return false;
}
