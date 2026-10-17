export type ProtocolSession = {
  fid: number;
  address: `0x${string}`;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  username?: string;
  displayName: string;
  pfpUrl?: string;
};

type ProtocolRuntime = {
  hubUrl: string;
  getSession: () => ProtocolSession | null;
};

let runtime: ProtocolRuntime | null = null;

export function setProtocolRuntime(next: ProtocolRuntime | null) {
  runtime = next;
}

export function protocolHubUrl(): string | null {
  return runtime?.hubUrl ?? null;
}

export function protocolSession(): ProtocolSession | null {
  return runtime?.getSession() ?? null;
}

/** Wallet session is active and the hosted API has no auth token. */
export function protocolReplacesHostedAuth(apiClient: {
  options: { authToken?: unknown };
}): boolean {
  return Boolean(
    protocolHubUrl() && protocolSession() && !apiClient.options.authToken,
  );
}
