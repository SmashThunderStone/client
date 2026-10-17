import {
  protocolHubUrl,
  ProtocolSession,
  protocolSession,
  requestProtocolSignIn,
} from './runtime';

export const PROTOCOL_UNAVAILABLE_MESSAGE = 'not available in SmashCast yet';

export class ProtocolSignInRequiredError extends Error {
  constructor() {
    super('Connect a wallet and approve a SmashCast signer first.');
    this.name = 'ProtocolSignInRequiredError';
  }
}

export class ProtocolUnavailableError extends Error {
  constructor() {
    super(PROTOCOL_UNAVAILABLE_MESSAGE);
    this.name = 'ProtocolUnavailableError';
  }
}

export function isProtocolSignInRequired(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (
      current instanceof ProtocolSignInRequiredError ||
      (current instanceof Error &&
        current.name === 'ProtocolSignInRequiredError')
    ) {
      return true;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

export function isProtocolUnavailable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (
      current instanceof ProtocolUnavailableError ||
      (current instanceof Error &&
        current.message.toLowerCase().includes(PROTOCOL_UNAVAILABLE_MESSAGE))
    ) {
      return true;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

export type ProtocolWrite =
  | { mode: 'hosted' }
  | { mode: 'hub'; session: ProtocolSession };

/**
 * Hosted writes stay available when protocol-direct is off.
 * When it is on, a registered signer is required and the wallet
 * sign-in flow opens if one is missing.
 */
export function takeProtocolWrite(): ProtocolWrite {
  if (!protocolHubUrl()) {
    return { mode: 'hosted' };
  }
  const session = protocolSession();
  if (!session) {
    requestProtocolSignIn();
    throw new ProtocolSignInRequiredError();
  }
  return { mode: 'hub', session };
}

/** Hosted-only mutations stop here instead of calling /v2. */
export function refuseHostedOnlyWrite(): void {
  if (protocolHubUrl()) {
    throw new ProtocolUnavailableError();
  }
}
