/** Writable public Snapchain node. CORS allows browser submitMessage. */
export const DEFAULT_HUB_URL = 'https://haatz.quilibrium.com';

/** Official read replica. Browser submit preflight fails (OPTIONS 404). */
export const SNAP_READ_HUB_URL = 'https://snap.farcaster.xyz:3381';

export const OPTIMISM_CHAIN_ID = 10;
export const OPTIMISM_RPC_URL = 'https://mainnet.optimism.io';

export const ID_REGISTRY_ADDRESS =
  '0x00000000fc6c5f01fc30151999387bb99a9f489b' as const;

export const KEY_GATEWAY_ADDRESS =
  '0x00000000fc56947c7e7183f8ca4b62398caadf0b' as const;

export const KEY_TYPE_ED25519 = 1;
export const METADATA_TYPE_SIGNED_KEY_REQUEST = 1;

/** Sliding expiry. Snapchain rejects anything above 90 days. */
export const MAX_KEY_TTL_SECONDS = 90 * 24 * 60 * 60;

export const FARCASTER_EPOCH_MS = 1_609_459_200_000;

/**
 * Gasless KEY_ADD domain. This is not the onchain SignedKeyRequestValidator
 * domain. A signature from the onchain domain is rejected by Snapchain.
 */
export const GASLESS_KEY_DOMAIN = {
  name: 'Farcaster KeyAdd',
  version: '1',
  chainId: 1,
} as const;

export const GASLESS_KEY_ADD_TYPES = {
  KeyAdd: [
    { name: 'fid', type: 'uint256' },
    { name: 'key', type: 'bytes' },
    { name: 'keyType', type: 'uint32' },
    { name: 'scopes', type: 'uint32[]' },
    { name: 'ttl', type: 'uint32' },
    { name: 'nonce', type: 'uint32' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export const GASLESS_SIGNED_KEY_REQUEST_TYPES = {
  SignedKeyRequest: [
    { name: 'requestFid', type: 'uint256' },
    { name: 'key', type: 'bytes' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export const SIGNED_KEY_REQUEST_METADATA_ABI = [
  {
    type: 'tuple',
    name: 'SignedKeyRequestMetadata',
    components: [
      { name: 'requestFid', type: 'uint256' },
      { name: 'requestSigner', type: 'address' },
      { name: 'signature', type: 'bytes' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
] as const;

export const KEY_GATEWAY_ADD_ABI = [
  {
    type: 'function',
    name: 'add',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'keyType', type: 'uint32' },
      { name: 'key', type: 'bytes' },
      { name: 'metadataType', type: 'uint8' },
      { name: 'metadata', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

export const ID_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'idOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'fid', type: 'uint256' }],
  },
] as const;
