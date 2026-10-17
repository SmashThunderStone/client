import {
  FarcasterNetwork,
  getFarcasterTime,
  makeMessage,
  Message,
  MessageData,
  MessageType,
  SIGNED_KEY_REQUEST_TYPE,
  SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN,
  SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_TYPES,
} from '@farcaster/core';
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
} from 'viem';

import {
  GASLESS_KEY_ADD_TYPES,
  GASLESS_KEY_DOMAIN,
  GASLESS_SIGNED_KEY_REQUEST_TYPES,
  KEY_GATEWAY_ADD_ABI,
  KEY_GATEWAY_ADDRESS,
  KEY_TYPE_ED25519,
  MAX_KEY_TTL_SECONDS,
  METADATA_TYPE_SIGNED_KEY_REQUEST,
  SIGNED_KEY_REQUEST_METADATA_ABI,
} from './constants';
import { unwrap } from './result';
import { nobleSigner } from './signer';

export const PROTOCOL_SCOPES: MessageType[] = [
  MessageType.CAST_ADD,
  MessageType.CAST_REMOVE,
  MessageType.REACTION_ADD,
  MessageType.REACTION_REMOVE,
  MessageType.LINK_ADD,
  MessageType.LINK_REMOVE,
  MessageType.USER_DATA_ADD,
];

export type GaslessKeyAddRequest = {
  fid: number;
  publicKey: Hex;
  nonce: number;
  /** Farcaster seconds, not Unix seconds. */
  deadline: number;
  ttl?: number;
  scopes?: number[];
};

export function farcasterTimeNow(): number {
  return unwrap(getFarcasterTime(), 'farcaster time');
}

export function gaslessSignedKeyRequestTypedData(params: {
  requestFid: number;
  publicKey: Hex;
  deadline: number;
}) {
  return {
    domain: GASLESS_KEY_DOMAIN,
    types: GASLESS_SIGNED_KEY_REQUEST_TYPES,
    primaryType: 'SignedKeyRequest' as const,
    message: {
      requestFid: BigInt(params.requestFid),
      key: params.publicKey,
      deadline: BigInt(params.deadline),
    },
  };
}

export function gaslessKeyAddTypedData(params: GaslessKeyAddRequest) {
  return {
    domain: GASLESS_KEY_DOMAIN,
    types: GASLESS_KEY_ADD_TYPES,
    primaryType: 'KeyAdd' as const,
    message: {
      fid: BigInt(params.fid),
      key: params.publicKey,
      keyType: KEY_TYPE_ED25519,
      scopes: params.scopes ?? PROTOCOL_SCOPES,
      ttl: params.ttl ?? MAX_KEY_TTL_SECONDS,
      nonce: params.nonce,
      deadline: BigInt(params.deadline),
    },
  };
}

export function encodeSignedKeyRequestMetadata(params: {
  requestFid: number;
  requestSigner: Address;
  signature: Hex;
  deadline: bigint;
}): Hex {
  return encodeAbiParameters(SIGNED_KEY_REQUEST_METADATA_ABI, [
    {
      requestFid: BigInt(params.requestFid),
      requestSigner: params.requestSigner,
      signature: params.signature,
      deadline: params.deadline,
    },
  ]);
}

export async function buildGaslessKeyAddMessage(params: {
  fid: number;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  requestSigner: Address;
  signedKeyRequestSignature: Hex;
  custodySignature: Hex;
  nonce: number;
  deadline: number;
  ttl?: number;
  scopes?: number[];
}): Promise<Message> {
  const scopes = params.scopes ?? PROTOCOL_SCOPES;
  const ttl = params.ttl ?? MAX_KEY_TTL_SECONDS;
  const metadataHex = encodeSignedKeyRequestMetadata({
    requestFid: params.fid,
    requestSigner: params.requestSigner,
    signature: params.signedKeyRequestSignature,
    deadline: BigInt(params.deadline),
  });
  const metadata = hexToBytes(metadataHex);
  const custodySignature = hexToBytes(params.custodySignature);
  const data = MessageData.create({
    type: MessageType.KEY_ADD,
    fid: params.fid,
    timestamp: farcasterTimeNow(),
    network: FarcasterNetwork.MAINNET,
    keyAddBody: {
      key: params.publicKey,
      keyType: KEY_TYPE_ED25519,
      custodySignature,
      deadline: params.deadline,
      nonce: params.nonce,
      metadata,
      metadataType: METADATA_TYPE_SIGNED_KEY_REQUEST,
      registrationTxHash: new Uint8Array(),
      scopes,
      ttl,
    },
  });
  return unwrap(
    await makeMessage(data, nobleSigner(params.privateKey)),
    'key add',
  );
}

/**
 * Onchain fallback. Deadline is a Unix timestamp. The domain is the
 * SignedKeyRequestValidator on OP Mainnet, which is a different signature
 * from the gasless "Farcaster KeyAdd" domain.
 */
export function onchainSignedKeyRequestTypedData(params: {
  requestFid: number;
  publicKey: Hex;
  deadlineUnix: bigint;
}) {
  return {
    domain: SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN,
    types: {
      SignedKeyRequest: SIGNED_KEY_REQUEST_TYPE,
    },
    primaryType: 'SignedKeyRequest' as const,
    message: {
      requestFid: BigInt(params.requestFid),
      key: params.publicKey,
      deadline: params.deadlineUnix,
    },
  };
}

export function encodeKeyGatewayAdd(params: {
  publicKey: Hex;
  metadata: Hex;
}): { to: typeof KEY_GATEWAY_ADDRESS; data: Hex; chainId: 10 } {
  return {
    to: KEY_GATEWAY_ADDRESS,
    chainId: 10,
    data: encodeFunctionData({
      abi: KEY_GATEWAY_ADD_ABI,
      functionName: 'add',
      args: [
        KEY_TYPE_ED25519,
        params.publicKey,
        METADATA_TYPE_SIGNED_KEY_REQUEST,
        params.metadata,
      ],
    }),
  };
}

export const onchainSignedKeyRequestDomain =
  SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_TYPES;

function hexToBytes(hex: Hex): Uint8Array {
  const raw = hex.slice(2);
  const out = new Uint8Array(raw.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
