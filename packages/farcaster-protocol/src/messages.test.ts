import { validations } from '@farcaster/core';
import { bytesToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';

import {
  buildCastAdd,
  buildFollow,
  buildReaction,
  messageHash,
} from './messages';
import {
  buildGaslessKeyAddMessage,
  farcasterTimeNow,
  gaslessKeyAddTypedData,
  gaslessSignedKeyRequestTypedData,
} from './register';
import { generateEd25519Keypair } from './signer';

const FID = 218142;

describe('protocol messages', () => {
  it('builds a cast, reply, like, recast, and follow that core accepts', async () => {
    const { privateKey, publicKey } = generateEd25519Keypair();
    expect(publicKey.length).toBe(32);
    const signer = { fid: FID, privateKey };

    const cast = await buildCastAdd(signer, { text: 'smashcast protocol' });
    expect((await validations.validateMessage(cast)).isOk()).toBe(true);
    expect(cast.data?.castAddBody?.text).toBe('smashcast protocol');
    expect(messageHash(cast).startsWith('0x')).toBe(true);

    const reply = await buildCastAdd(signer, {
      text: 'reply',
      parent: { fid: 3, hash: messageHash(cast) },
    });
    expect((await validations.validateMessage(reply)).isOk()).toBe(true);
    expect(reply.data?.castAddBody?.parentCastId?.fid).toBe(3);

    const like = await buildReaction(signer, 'add', 'like', {
      fid: 3,
      hash: messageHash(cast),
    });
    expect((await validations.validateMessage(like)).isOk()).toBe(true);

    const unlike = await buildReaction(signer, 'remove', 'like', {
      fid: 3,
      hash: messageHash(cast),
    });
    expect((await validations.validateMessage(unlike)).isOk()).toBe(true);

    const recast = await buildReaction(signer, 'add', 'recast', {
      fid: 3,
      hash: messageHash(cast),
    });
    expect((await validations.validateMessage(recast)).isOk()).toBe(true);

    const unrecast = await buildReaction(signer, 'remove', 'recast', {
      fid: 3,
      hash: messageHash(cast),
    });
    expect((await validations.validateMessage(unrecast)).isOk()).toBe(true);

    const follow = await buildFollow(signer, 'add', 3);
    expect((await validations.validateMessage(follow)).isOk()).toBe(true);
    expect(follow.data?.linkBody?.type).toBe('follow');

    const unfollow = await buildFollow(signer, 'remove', 3);
    expect((await validations.validateMessage(unfollow)).isOk()).toBe(true);
    expect(unfollow.data?.type).toBe(6);
    expect(unfollow.data?.linkBody?.type).toBe('follow');
  });

  it('rejects casts over 320 bytes before signing', async () => {
    const { privateKey } = generateEd25519Keypair();
    await expect(
      buildCastAdd({ fid: FID, privateKey }, { text: 'a'.repeat(321) }),
    ).rejects.toThrow(/320 bytes/);
  });

  it('wraps a gasless KEY_ADD signed by a local custody account', async () => {
    const { privateKey, publicKey } = generateEd25519Keypair();
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    );
    const publicKeyHex = bytesToHex(publicKey);
    const deadline = farcasterTimeNow() + 60 * 60;
    const request = await account.signTypedData(
      gaslessSignedKeyRequestTypedData({
        requestFid: FID,
        publicKey: publicKeyHex,
        deadline,
      }),
    );
    const custody = await account.signTypedData(
      gaslessKeyAddTypedData({
        fid: FID,
        publicKey: publicKeyHex,
        nonce: 1,
        deadline,
      }),
    );
    const message = await buildGaslessKeyAddMessage({
      fid: FID,
      privateKey,
      publicKey,
      requestSigner: account.address,
      signedKeyRequestSignature: request,
      custodySignature: custody,
      nonce: 1,
      deadline,
    });
    expect(message.data?.type).toBe(16);
    expect(message.data?.keyAddBody?.keyType).toBe(1);
    expect(message.data?.keyAddBody?.metadata.length).toBeGreaterThan(32);
    expect(message.signer.length).toBe(32);
  });
});
