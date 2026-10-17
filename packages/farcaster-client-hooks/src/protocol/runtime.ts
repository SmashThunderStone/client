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
  requestSignIn?: () => void;
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

/**
 * A local signer replaces hosted reads. A leftover hosted auth token does
 * not keep those reads on the hosted client.
 */
export function protocolReplacesHostedAuth(_apiClient: {
  options: { authToken?: unknown };
}): boolean {
  return Boolean(protocolHubUrl() && protocolSession());
}

export function requestProtocolSignIn(): void {
  runtime?.requestSignIn?.();
}
