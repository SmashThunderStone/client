import { NobleEd25519Signer } from '@farcaster/core';
import { ed25519 } from '@noble/curves/ed25519';

import { unwrap } from './result';

export type Ed25519Keypair = {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
};

export function generateEd25519Keypair(): Ed25519Keypair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function publicKeyFromPrivateKey(privateKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(privateKey);
}

export function nobleSigner(privateKey: Uint8Array): NobleEd25519Signer {
  return new NobleEd25519Signer(privateKey);
}

export async function signerPublicKey(
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  const signer = nobleSigner(privateKey);
  return unwrap(await signer.getSignerKey(), 'signer public key');
}
