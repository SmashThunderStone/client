import { bytesToHex, type Hex, hexToBytes } from 'viem';

const DB_NAME = 'smashcast-protocol';
const STORE = 'signers';

export const PROTOCOL_META_KEY = 'smashcast.protocolSession';

export type StoredSigner = {
  address: `0x${string}`;
  fid: number;
  privateKeyHex: Hex;
  publicKeyHex: Hex;
  registered: boolean;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadSigner(
  address: `0x${string}`,
): Promise<StoredSigner | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(address.toLowerCase());
    request.onsuccess = () => resolve((request.result as StoredSigner) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSigner(signer: StoredSigner): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(signer, signer.address.toLowerCase());
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  window.localStorage.setItem(
    PROTOCOL_META_KEY,
    JSON.stringify({ address: signer.address, fid: signer.fid }),
  );
}

export async function deleteSigner(address: `0x${string}`): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(address.toLowerCase());
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  window.localStorage.removeItem(PROTOCOL_META_KEY);
}

export function readMetaAddress(): `0x${string}` | null {
  const raw = window.localStorage.getItem(PROTOCOL_META_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { address?: string };
    if (parsed.address?.startsWith('0x')) {
      return parsed.address as `0x${string}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function signerBytes(hex: Hex): Uint8Array {
  return hexToBytes(hex);
}

export function signerHex(bytes: Uint8Array): Hex {
  return bytesToHex(bytes);
}
