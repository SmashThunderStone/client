import {
  CastType,
  FarcasterNetwork,
  hexStringToBytes,
  makeCastAdd,
  makeLinkAdd,
  makeLinkRemove,
  makeReactionAdd,
  makeReactionRemove,
  Message,
  MessageType,
  ReactionType,
} from '@farcaster/core';
import { bytesToHex, type Hex } from 'viem';

import { SnapchainHub, submitAndReadBack } from './hub';
import { unwrap } from './result';
import { nobleSigner } from './signer';

const CAST_BYTE_LIMIT = 320;

export type ProtocolSigner = {
  fid: number;
  privateKey: Uint8Array;
};

export type CastDraft = {
  text: string;
  embeds?: string[];
  parent?: {
    fid: number;
    hash: string;
  };
};

function dataOptions(fid: number) {
  return { fid, network: FarcasterNetwork.MAINNET };
}

function hashBytes(hash: string): Uint8Array {
  const normalized = hash.startsWith('0x') ? hash : `0x${hash}`;
  return unwrap(hexStringToBytes(normalized), 'cast hash');
}

export function messageHash(message: Message): Hex {
  return bytesToHex(message.hash);
}

export async function buildCastAdd(
  signer: ProtocolSigner,
  draft: CastDraft,
): Promise<Message> {
  const textBytes = new TextEncoder().encode(draft.text);
  if (textBytes.length > CAST_BYTE_LIMIT) {
    throw new Error(
      `Casts are limited to ${CAST_BYTE_LIMIT} bytes (this one is ${textBytes.length}).`,
    );
  }
  if (draft.parent && !draft.parent.fid) {
    throw new Error('A reply needs the parent cast author FID.');
  }

  const message = unwrap(
    await makeCastAdd(
      {
        text: draft.text,
        embeds: (draft.embeds ?? [])
          .filter((url) => url.length > 0)
          .map((url) => ({ url })),
        embedsDeprecated: [],
        mentions: [],
        mentionsPositions: [],
        parentCastId: draft.parent
          ? { fid: draft.parent.fid, hash: hashBytes(draft.parent.hash) }
          : undefined,
        type: CastType.CAST,
      },
      dataOptions(signer.fid),
      nobleSigner(signer.privateKey),
    ),
    'cast',
  );
  return message;
}

export async function buildReaction(
  signer: ProtocolSigner,
  action: 'add' | 'remove',
  reaction: 'like' | 'recast',
  target: { fid: number; hash: string },
): Promise<Message> {
  const body = {
    type: reaction === 'like' ? ReactionType.LIKE : ReactionType.RECAST,
    targetCastId: { fid: target.fid, hash: hashBytes(target.hash) },
  };
  const build = action === 'add' ? makeReactionAdd : makeReactionRemove;
  return unwrap(
    await build(body, dataOptions(signer.fid), nobleSigner(signer.privateKey)),
    'reaction',
  );
}

export async function buildFollow(
  signer: ProtocolSigner,
  action: 'add' | 'remove',
  targetFid: number,
): Promise<Message> {
  const body = { type: 'follow', targetFid };
  const build = action === 'add' ? makeLinkAdd : makeLinkRemove;
  return unwrap(
    await build(body, dataOptions(signer.fid), nobleSigner(signer.privateKey)),
    'follow',
  );
}

export async function publishMessage(
  hubUrl: string,
  message: Message,
  readBackPath: string,
  presence: 'present' | 'absent' = 'present',
): Promise<Hex> {
  const hub = new SnapchainHub(hubUrl);
  const hash = messageHash(message);
  await submitAndReadBack(hub, message, async () => {
    const json = await hub.getOptionalJson<{ data?: { type?: string } }>(
      readBackPath,
    );
    if (presence === 'absent') {
      return json === null;
    }
    return Boolean(json?.data?.type);
  });
  return hash;
}

export function reactionReadBackPath(params: {
  fid: number;
  reaction: 'like' | 'recast';
  targetFid: number;
  targetHash: string;
}): string {
  const reactionType = params.reaction === 'like' ? 'Like' : 'Recast';
  const hash = params.targetHash.startsWith('0x')
    ? params.targetHash
    : `0x${params.targetHash}`;
  return `/v1/reactionById?fid=${params.fid}&reaction_type=${reactionType}&target_fid=${params.targetFid}&target_hash=${hash}`;
}

export function linkReadBackPath(fid: number, targetFid: number): string {
  return `/v1/linkById?fid=${fid}&target_fid=${targetFid}&link_type=follow`;
}

export function castReadBackPath(fid: number, hash: string): string {
  const normalized = hash.startsWith('0x') ? hash : `0x${hash}`;
  return `/v1/castById?fid=${fid}&hash=${normalized}`;
}

export { CAST_BYTE_LIMIT, MessageType };
