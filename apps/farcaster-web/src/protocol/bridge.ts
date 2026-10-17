import { type ProtocolSession } from 'farcaster-client-hooks';

let session: ProtocolSession | null = null;
const listeners = new Set<() => void>();

export function getProtocolSession(): ProtocolSession | null {
  return session;
}

export function subscribeProtocolSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setProtocolSession(next: ProtocolSession | null) {
  session = next;
  for (const listener of listeners) {
    listener();
  }
}
